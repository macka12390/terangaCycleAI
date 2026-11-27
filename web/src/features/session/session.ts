// Session : jeton et utilisateur. Un compte de démonstration reste dans l'onglet
// (sessionStorage) ; un compte réel, connecté par SMS, est gardé sur l'appareil
// (localStorage) jusqu'à l'expiration du jeton (7 jours). Jamais dans les journaux.
import type { User } from '../../api/types.ts'

const KEY = 'tc-demo-session'
const PERSISTENT_KEY = 'tc-session'

interface StoredSession {
  token: string
  user: User
}

function readFrom(storage: Storage, key: string): StoredSession | null {
  try {
    const raw = storage.getItem(key)
    return raw ? (JSON.parse(raw) as StoredSession) : null
  } catch {
    return null
  }
}

function read(): StoredSession | null {
  return readFrom(sessionStorage, KEY) ?? readFrom(localStorage, PERSISTENT_KEY)
}

export function getToken(): string | null {
  return read()?.token ?? null
}

export function getUser(): User | null {
  return read()?.user ?? null
}

/** `persist` : compte réel, gardé sur l'appareil ; sinon session de démo limitée à l'onglet. */
export function saveSession(token: string, user: User, { persist = false } = {}): void {
  clearSession()
  const value = JSON.stringify({ token, user })
  try {
    if (persist) localStorage.setItem(PERSISTENT_KEY, value)
    else sessionStorage.setItem(KEY, value)
  } catch {
    // Stockage indisponible (navigation privée) : la session ne survivra pas au rechargement.
  }
}

export function clearSession(): void {
  try {
    sessionStorage.removeItem(KEY)
    localStorage.removeItem(PERSISTENT_KEY)
  } catch {
    // Rien à effacer.
  }
}
