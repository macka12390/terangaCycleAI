// Règles d'affichage de la page « Comptes ». Le backend applique les vraies règles ; ceci
// évite seulement d'afficher des boutons qui seraient refusés.
import type { Role, User } from '../../api/types.ts'
import { formatPhone } from '../session/login.ts'

export const ROLE_ORDER: Role[] = ['citizen', 'collector', 'recycler', 'admin', 'superadmin']

/** L'utilisateur connecté peut-il modifier ce compte ? */
export function canManage(actor: User | null, target: User, manageable: Role[]): boolean {
  if (!actor || target.id === actor.id) return false
  if (target.demo_login) return false
  return manageable.includes(target.role)
}

/** Rôles proposés dans le menu, dans un ordre stable. */
export function roleOptions(manageable: Role[]): Role[] {
  return ROLE_ORDER.filter((role) => manageable.includes(role))
}

/** « +221771234567 » → « +221 77 123 45 67 » ; « — » sans numéro (compte de démo). */
export function displayPhone(phone: string | null | undefined): string {
  return phone ? `+221 ${formatPhone(phone)}` : '—'
}
