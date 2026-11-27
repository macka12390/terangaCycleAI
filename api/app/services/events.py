"""Inscription au journal des statuts et transitions atomiques.

`transition()` fait un UPDATE conditionnel (`WHERE status IN (…)`) : si deux requêtes
concurrentes tentent la même transition, une seule modifie la ligne ; l'autre reçoit 0 ligne
et échoue proprement. C'est ce qui garantit qu'une mission n'est acceptée qu'une fois.
"""

from sqlalchemy import update

from app.extensions import db
from app.models import StatusEvent, User
from app.utils.time import utcnow


def record_event(
    *,
    entity: str,
    entity_id: int,
    report_id: int,
    from_status: str | None,
    to_status: str,
    actor: User | None,
    note: str | None = None,
) -> None:
    db.session.add(
        StatusEvent(
            entity=entity,
            entity_id=entity_id,
            report_id=report_id,
            from_status=from_status,
            to_status=to_status,
            actor_id=actor.id if actor else None,
            note=note,
        )
    )


def transition(model, row_id: int, from_statuses: tuple[str, ...], to_status: str, **values) -> bool:
    """Passe la ligne `row_id` à `to_status` si son statut est dans `from_statuses`.

    Renvoie False si aucune ligne n'a changé (statut déjà modifié par quelqu'un d'autre).
    """
    statement = (
        update(model)
        .where(model.id == row_id, model.status.in_(from_statuses))
        .values(status=to_status, **values)
    )
    if hasattr(model, "updated_at"):
        statement = statement.values(updated_at=utcnow())
    # Synchronisation par défaut : les objets déjà chargés en session reflètent la mise à jour.
    result = db.session.execute(statement)
    return result.rowcount == 1
