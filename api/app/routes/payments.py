from flask import Blueprint, g, request

from app.payments_provider import get_payments
from app.serializers import payment_to_dict
from app.services import payments as payment_service
from app.services.auth import auth_required
from app.services.organisations import scoped_organisation_id
from app.utils.responses import json_body, ok

bp = Blueprint("payments", __name__, url_prefix="/api")


def _provider() -> dict:
    provider = get_payments()
    return {"name": provider.name, "simulated": provider.simulated}


@bp.get("/payments")
@auth_required("admin", "collector", "recycler")
def index():
    rows = payment_service.list_payments(g.user, request.args)
    return ok(
        payments=[payment_to_dict(row) for row in rows],
        summary=payment_service.summary_for(g.user, request.args.get("organisation_id")),
        provider=_provider(),
    )


@bp.post("/payments/<int:payment_id>/pay")
@auth_required("admin")
def pay(payment_id: int):
    return ok(payment=payment_to_dict(payment_service.pay(payment_id, g.user)), provider=_provider())


@bp.post("/payments/rewards/pay-all")
@auth_required("admin")
def pay_all():
    return ok(result=payment_service.pay_all(g.user, json_body()), provider=_provider())


@bp.post("/payments/rewards/accrue")
@auth_required("admin")
def accrue():
    return ok(created=payment_service.accrue_missing(g.user, json_body()))


@bp.get("/tariffs")
@auth_required("admin")
def tariffs():
    organisation_id = scoped_organisation_id(g.user, request.args.get("organisation_id"))
    if organisation_id is None:
        return ok(organisation_id=None, tariffs=None)
    return ok(organisation_id=organisation_id, tariffs=payment_service.tariffs_of(organisation_id))


@bp.put("/tariffs")
@auth_required("admin")
def set_tariff():
    organisation_id, tariffs = payment_service.set_tariff(g.user, json_body())
    return ok(organisation_id=organisation_id, tariffs=tariffs)


@bp.post("/lots/<int:lot_id>/pay")
@auth_required("recycler")
def pay_lot(lot_id: int):
    payment = payment_service.pay_lot(lot_id, g.user)
    return ok(payment=payment_to_dict(payment), provider=_provider())
