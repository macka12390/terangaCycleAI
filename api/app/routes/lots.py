from flask import Blueprint, g, request

from app.serializers import lot_to_dict
from app.services import lots as lot_service
from app.services.auth import auth_required
from app.utils.responses import json_body, ok

bp = Blueprint("lots", __name__, url_prefix="/api/lots")


@bp.get("")
@auth_required("recycler", "collector", "admin")
def index():
    lots = lot_service.list_lots(g.user, request.args)
    return ok(lots=[lot_to_dict(lot, g.user) for lot in lots])


@bp.get("/stock")
@auth_required("collector")
def stock():
    """Kilos vérifiés encore disponibles à la vente, par matière."""
    return ok(stock=lot_service.stock(g.user))


@bp.post("")
@auth_required("collector")
def create():
    return ok(201, lot=lot_to_dict(lot_service.create_lot(g.user, json_body()), g.user))


@bp.post("/<int:lot_id>/reserve")
@auth_required("recycler")
def reserve(lot_id: int):
    return ok(lot=lot_to_dict(lot_service.reserve(lot_id, g.user), g.user))


@bp.post("/<int:lot_id>/release")
@auth_required("recycler", "collector")
def release(lot_id: int):
    return ok(lot=lot_to_dict(lot_service.release(lot_id, g.user), g.user))


@bp.post("/<int:lot_id>/handover")
@auth_required("collector")
def hand_over(lot_id: int):
    return ok(lot=lot_to_dict(lot_service.hand_over(lot_id, g.user), g.user))


@bp.post("/<int:lot_id>/cancel")
@auth_required("collector")
def cancel(lot_id: int):
    return ok(lot=lot_to_dict(lot_service.cancel(lot_id, g.user), g.user))
