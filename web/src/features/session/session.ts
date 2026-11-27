// Session de démonstration : jeton et utilisateur choisis sur l'écran « Comptes de démo ».
// Gardés dans sessionStorage (l'onglet), jamais dans les journaux. Pas de vraie
// authentification au MVP (cahier des charges, §2).
import type { User } from '../../api/types.ts'

const KEY = 'tc-demo-session'

interface StoredSession {
  token: string
  user: User
}

function read(): StoredSession | null {
  try {
    const raw = sessionStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as StoredSession) : null
  } catch {
    return null
  }
}

export function getToken(): string | null {
  return read()?.token ?? null
}

export function getUser(): User | null {
  return read()?.user ?? null
}

export function saveSession(token: string, user: User): void {
  sessionStorage.setItem(KEY, JSON.stringify({ token, user }))
}

export function clearSession(): void {
  sessionStorage.removeItem(KEY)
}
