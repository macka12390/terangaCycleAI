"""Fournisseurs de paiement mobile money (PAYMENT_PROVIDER), interchangeables.

- `simulated` (défaut) : AUCUN argent ne bouge. Le paiement réussit avec une référence
  « SIM-… », et il est marqué « simulé » partout (API, console, SMS).
- un vrai fournisseur (Wave, Orange Money…) se branchera ici : `payout` verse au
  bénéficiaire, `charge` prélève le payeur. Ses clés vont dans .env, jamais dans Git.
"""

import secrets
from dataclasses import dataclass
from typing import Protocol

from flask import Flask, current_app

_EXTENSION_KEY = "terangacycle_payments"


@dataclass(frozen=True)
class ProviderResult:
    ok: bool
    reference: str | None = None
    error: str | None = None


class PaymentProvider(Protocol):
    name: str
    simulated: bool

    def payout(self, phone: str | None, amount_fcfa: int, reference: str) -> ProviderResult: ...

    def charge(self, phone: str | None, amount_fcfa: int, reference: str) -> ProviderResult: ...


class SimulatedProvider:
    """Mode simulé : réussit toujours (sauf montant hors limite), sans transférer d'argent."""

    name = "simulated"
    simulated = True
    # Plafond d'une transaction mobile money courante : au-delà, échec simulé.
    MAX_AMOUNT_FCFA = 2_000_000

    def _result(self, amount_fcfa: int) -> ProviderResult:
        if amount_fcfa > self.MAX_AMOUNT_FCFA:
            return ProviderResult(ok=False, error="Montant au-delà du plafond d'une transaction")
        return ProviderResult(ok=True, reference=f"SIM-{secrets.token_hex(6).upper()}")

    def payout(self, phone, amount_fcfa, reference):
        return self._result(amount_fcfa)

    def charge(self, phone, amount_fcfa, reference):
        return self._result(amount_fcfa)


PROVIDERS = {"simulated": SimulatedProvider}


def init_payments(app: Flask) -> None:
    name = app.config["PAYMENT_PROVIDER"]
    if name not in PROVIDERS:
        raise RuntimeError(
            f"PAYMENT_PROVIDER={name!r} inconnu (disponibles : {', '.join(PROVIDERS)})."
        )
    app.extensions[_EXTENSION_KEY] = PROVIDERS[name]()


def get_payments() -> PaymentProvider:
    return current_app.extensions[_EXTENSION_KEY]
