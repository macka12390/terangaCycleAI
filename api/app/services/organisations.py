"""Organisations (étape 3) : zones, rattachement des signalements et cloisonnement.

Règle de cloisonnement : un admin ou un collecteur ne voit que les signalements, missions,
preuves et statistiques de SON organisation. Le super admin voit tout. Un compte rattaché
à aucune organisation ne voit rien (jamais « tout » par défaut).
"""

import json
from collections.abc import Mapping

from sqlalchemy import false, func

from app.constants import DEFAULT_ORGANISATION, ORGANISATION_KINDS, ORGANISATION_ROLES, ReportStatus
from app.extensions import db
from app.models import AuditLog, Organisation, Report, User
from app.utils.errors import ApiError, forbidden, not_found, validation_error
from app.utils.validation import parse_choice, parse_float, parse_text

# Organisation de démonstration plus petite, incluse dans la zone principale : montre que
# la zone la plus précise l'emporte (Pikine et Guédiawaye).
DEMO_ORGANISATIONS = {
    "pikine": {
        "name": "UCG Pikine-Guédiawaye (démo)",
        "kind": "ucg",
        "min_lat": 14.73,
        "max_lat": 14.81,
        "min_lng": -17.42,
        "max_lng": -17.33,
        "is_demo": True,
    },
}

# Un signalement ne change d'organisation que tant qu'aucun collecteur ne s'en occupe.
REASSIGNABLE_STATUSES = (ReportStatus.PENDING, ReportStatus.APPROVED, ReportStatus.REJECTED)


# --- Organisations de base -----------------------------------------------------------------


def ensure_default_organisation() -> Organisation:
    organisation = Organisation.query.filter_by(name=DEFAULT_ORGANISATION["name"]).first()
    if organisation is None:
        organisation = Organisation(**DEFAULT_ORGANISATION)
        db.session.add(organisation)
        db.session.commit()
    return organisation


def default_organisation() -> Organisation:
    return ensure_default_organisation()


def ensure_demo_organisations() -> dict[str, Organisation]:
    found = {}
    for key, values in DEMO_ORGANISATIONS.items():
        organisation = Organisation.query.filter_by(name=values["name"]).first()
        if organisation is None:
            organisation = Organisation(**values)
            db.session.add(organisation)
            db.session.commit()
        found[key] = organisation
    return found


def resolve(latitude: float, longitude: float) -> Organisation | None:
    """Organisation active dont la zone contient le point ; la plus petite en cas de chevauchement."""
    candidates = [
        organisation
        for organisation in Organisation.query.filter_by(is_active=True).all()
        if organisation.contains(latitude, longitude)
    ]
    return min(candidates, key=lambda o: o.area, default=None)


def backfill_organisations() -> None:
    """Migration de données (une fois) : rattache les données d'avant l'étape 3."""
    default = ensure_default_organisation()
    for report in Report.query.filter(Report.organisation_id.is_(None)).all():
        organisation = resolve(report.latitude, report.longitude) or default
        report.organisation_id = organisation.id
    for user in User.query.filter(
        User.organisation_id.is_(None), User.role.in_(ORGANISATION_ROLES)
    ).all():
        user.organisation_id = default.id
    db.session.commit()


# --- Cloisonnement -------------------------------------------------------------------------


def sees_all(user: User) -> bool:
    return user.role == "superadmin"


def report_scope(user: User) -> list:
    """Conditions SQL à ajouter à toute requête sur les signalements (vide = tout)."""
    if sees_all(user):
        return []
    if user.organisation_id is None:
        return [false()]
    return [Report.organisation_id == user.organisation_id]


def ensure_report_in_scope(user: User, report: Report) -> None:
    if sees_all(user):
        return
    if user.organisation_id is None or report.organisation_id != user.organisation_id:
        raise forbidden("Ce signalement relève d'une autre organisation.")


def scoped_organisation_id(user: User, requested: object) -> int | None:
    """Organisation des statistiques : la sienne, ou celle choisie par le super admin."""
    if not sees_all(user):
        return user.organisation_id if user.organisation_id is not None else -1
    if requested in (None, ""):
        return None
    try:
        return int(str(requested))
    except ValueError:
        raise validation_error("« organisation_id » doit être un nombre.", "organisation_id") from None


# --- Gestion (super admin) -----------------------------------------------------------------


def _audit(actor: User, action: str, **details) -> None:
    db.session.add(
        AuditLog(
            actor_id=actor.id,
            action=action,
            details=json.dumps(details, ensure_ascii=False) if details else None,
        )
    )


def get_organisation(organisation_id: int) -> Organisation:
    organisation = db.session.get(Organisation, organisation_id)
    if organisation is None:
        raise not_found("Organisation introuvable.")
    return organisation


def list_organisations(user: User) -> list[tuple[Organisation, dict]]:
    query = Organisation.query
    if not sees_all(user):
        if user.organisation_id is None:
            return []
        query = query.filter(Organisation.id == user.organisation_id)
    organisations = query.order_by(Organisation.is_demo, Organisation.name).all()
    report_counts = dict(
        db.session.query(Report.organisation_id, func.count(Report.id))
        .group_by(Report.organisation_id)
        .all()
    )
    member_counts: dict[tuple[int, str], int] = {
        (organisation_id, role): count
        for organisation_id, role, count in db.session.query(
            User.organisation_id, User.role, func.count(User.id)
        )
        .filter(User.is_active.is_(True))
        .group_by(User.organisation_id, User.role)
        .all()
    }
    return [
        (
            organisation,
            {
                "reports": int(report_counts.get(organisation.id, 0)),
                "admins": member_counts.get((organisation.id, "admin"), 0),
                "collectors": member_counts.get((organisation.id, "collector"), 0),
            },
        )
        for organisation in organisations
    ]


def unassigned_reports_count() -> int:
    return db.session.query(func.count(Report.id)).filter(Report.organisation_id.is_(None)).scalar()


def _parse_zone(data: Mapping, current: Organisation | None = None) -> dict[str, float]:
    zone = {}
    bounds = {"min_lat": (-90, 90), "max_lat": (-90, 90), "min_lng": (-180, 180), "max_lng": (-180, 180)}
    for field, (low, high) in bounds.items():
        value = parse_float(data, field, required=current is None, minimum=low, maximum=high)
        zone[field] = value if value is not None else getattr(current, field)
    if zone["min_lat"] >= zone["max_lat"]:
        raise validation_error("La latitude minimale doit être inférieure à la maximale.", "min_lat")
    if zone["min_lng"] >= zone["max_lng"]:
        raise validation_error("La longitude minimale doit être inférieure à la maximale.", "min_lng")
    return zone


def _parse_name(data: Mapping, exclude_id: int | None = None) -> str:
    name = parse_text(data, "name", max_length=120)
    if not name:
        raise validation_error("Le nom de l'organisation est obligatoire.", "name")
    duplicate = Organisation.query.filter(func.lower(Organisation.name) == name.lower())
    if exclude_id is not None:
        duplicate = duplicate.filter(Organisation.id != exclude_id)
    if duplicate.first() is not None:
        raise ApiError(409, "NAME_TAKEN", "Une organisation porte déjà ce nom.", {"field": "name"})
    return name


def create_organisation(actor: User, data: Mapping) -> Organisation:
    name = _parse_name(data)
    kind = parse_choice(data, "kind", tuple(ORGANISATION_KINDS))
    organisation = Organisation(name=name, kind=kind, is_demo=False, **_parse_zone(data))
    db.session.add(organisation)
    db.session.flush()
    _audit(actor, "organisation.create", organisation=name)
    db.session.commit()
    return organisation


def update_organisation(actor: User, organisation_id: int, data: Mapping) -> Organisation:
    organisation = get_organisation(organisation_id)
    changes = {}
    if "name" in data:
        name = _parse_name(data, exclude_id=organisation.id)
        if name != organisation.name:
            changes["name"] = [organisation.name, name]
            organisation.name = name
    if "kind" in data:
        kind = parse_choice(data, "kind", tuple(ORGANISATION_KINDS))
        if kind != organisation.kind:
            changes["kind"] = [organisation.kind, kind]
            organisation.kind = kind
    if any(field in data for field in ("min_lat", "max_lat", "min_lng", "max_lng")):
        zone = _parse_zone(data, current=organisation)
        before = {field: getattr(organisation, field) for field in zone}
        if zone != before:
            changes["zone"] = [before, zone]
            for field, value in zone.items():
                setattr(organisation, field, value)
    if "is_active" in data:
        active = data["is_active"]
        if not isinstance(active, bool):
            raise validation_error("« is_active » doit valoir true ou false.", "is_active")
        if active != organisation.is_active:
            changes["is_active"] = [organisation.is_active, active]
            organisation.is_active = active
    if changes:
        _audit(actor, "organisation.update", organisation=organisation.name, changes=changes)
        db.session.commit()
    return organisation


def reassign_report(actor: User, report_id: int, data: Mapping) -> Report:
    """Le super admin rattache un signalement (souvent « hors zone ») à une organisation."""
    report = db.session.get(Report, report_id)
    if report is None:
        raise not_found("Signalement introuvable.")
    raw = data.get("organisation_id")
    if not isinstance(raw, int) or isinstance(raw, bool):
        raise validation_error("Choisissez une organisation.", "organisation_id")
    organisation = get_organisation(raw)
    if report.status not in REASSIGNABLE_STATUSES:
        raise ApiError(
            409, "INVALID_TRANSITION",
            "Un collecteur s'occupe déjà de ce dépôt : il ne change plus d'organisation.",
            {"status": report.status},
        )
    previous = report.organisation.name if report.organisation else None
    report.organisation_id = organisation.id
    _audit(
        actor, "report.reassign",
        tracking_number=report.tracking_number, organisation=[previous, organisation.name],
    )
    db.session.commit()
    return report
