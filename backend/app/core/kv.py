"""Client Valkey synchrone (codes à usage unique, compteurs d'essais).

Les routes et les services sont des `def` exécutés dans le pool de threads (voir
`core.db`) : le client synchrone de redis-py convient. Délais bornés.
"""

from functools import lru_cache

from redis import Redis

from app.core.config import get_settings

KV_TIMEOUT_S = 2


@lru_cache
def get_kv() -> Redis:
    return Redis.from_url(
        get_settings().valkey_url,
        socket_connect_timeout=KV_TIMEOUT_S,
        socket_timeout=KV_TIMEOUT_S,
    )
