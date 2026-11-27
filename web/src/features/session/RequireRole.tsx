import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'

import type { Role } from '../../api/types.ts'
import { PATHS } from '../../paths.ts'
import { getUser } from './session.ts'

/** Espace réservé à un rôle : sans session de démo du bon rôle, écran des comptes de démo.
 *  Le backend vérifie le rôle de son côté ; ce garde ne sert qu'à la navigation. */
export function RequireRole({ role, children }: { role: Role; children: ReactNode }) {
  const location = useLocation()
  const user = getUser()
  if (user?.role !== role) {
    return <Navigate to={`${PATHS.demo}?next=${encodeURIComponent(location.pathname)}`} replace />
  }
  return children
}
