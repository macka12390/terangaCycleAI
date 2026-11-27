"""Envoi de SMS : interface commune et fournisseurs interchangeables (SMS_PROVIDER).

- `console` : mode test. Aucun SMS n'est envoyé : le message est écrit dans le journal du
  serveur (numéro masqué) et gardé en mémoire. Sans compte ni coût.
- un vrai fournisseur (Orange SMS API au Sénégal…) se branchera ici sans toucher au reste.
"""

import logging
import threading
from collections import deque
from dataclasses import dataclass
from typing import Protocol

from flask import Flask, current_app

from app.utils.phone import mask_phone

log = logging.getLogger(__name__)

_EXTENSION_KEY = "terangacycle_sms"


@dataclass(frozen=True)
class SentSms:
    to: str
    message: str


class SmsProvider(Protocol):
    name: str

    def send(self, to: str, message: str) -> None: ...


class ConsoleSmsProvider:
    """Mode test : le SMS est affiché dans le journal du serveur au lieu d'être envoyé."""

    name = "console"

    def __init__(self, keep: int = 50):
        self.sent: deque[SentSms] = deque(maxlen=keep)
        self._lock = threading.Lock()

    def send(self, to: str, message: str) -> None:
        with self._lock:
            self.sent.append(SentSms(to=to, message=message))
        # Numéro masqué : jamais de numéro complet dans les journaux (règle 13).
        log.warning("SMS (mode test, non envoyé) à %s : %s", mask_phone(to), message)


PROVIDERS = {"console": ConsoleSmsProvider}


def init_sms(app: Flask) -> None:
    name = app.config["SMS_PROVIDER"]
    if name not in PROVIDERS:
        raise RuntimeError(
            f"SMS_PROVIDER={name!r} inconnu (disponibles : {', '.join(PROVIDERS)})."
        )
    app.extensions[_EXTENSION_KEY] = PROVIDERS[name]()


def get_sms() -> SmsProvider:
    return current_app.extensions[_EXTENSION_KEY]
