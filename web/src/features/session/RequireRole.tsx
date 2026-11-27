import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'

import type { Role } from '../../api/types.ts'
import { PATHS } from '../../paths.ts'
import { getUser } from './session.ts'

/** Espace réservé à un rôle : sans session du bon rôle, écran de connexion (SMS ou démo).
 *  Le backend vérifie le rôle de son côté ; ce garde ne sert qu'à la navigation. */
export function RequireRole({ role, children }: { role: Role; children: ReactNode }) {
  const location = useLocation()
  const user = getUser()
  // Le super admin a accès à tout ce qui est réservé à l'admin.
  const allowed = user?.role === role || (role === 'admin' && user?.role === 'superadmin')
  if (!allowed) {
    return <Navigate to={`${PATHS.login}?next=${encodeURIComponent(location.pathname)}`} replace />
  }
  return children
}
