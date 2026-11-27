import { lazy } from 'react'

// Console admin (graphiques, carte) chargée à la demande, dans un paquet à part : la PWA
// du citoyen ne la télécharge ni ne la précharge (vite.config.ts, pwa.config.ts).
export const AdminLayout = lazy(() =>
  import('./AdminLayout.tsx').then((m) => ({ default: m.AdminLayout })),
)
export const AdminDashboard = lazy(() =>
  import('./AdminDashboard.tsx').then((m) => ({ default: m.AdminDashboard })),
)
export const AdminReportsPage = lazy(() =>
  import('./AdminReportsPage.tsx').then((m) => ({ default: m.AdminReportsPage })),
)
export const AdminMissionsPage = lazy(() =>
  import('./AdminMissionsPage.tsx').then((m) => ({ default: m.AdminMissionsPage })),
)
export const AdminMapPage = lazy(() =>
  import('./AdminMapPage.tsx').then((m) => ({ default: m.AdminMapPage })),
)
export const AdminProofsPage = lazy(() =>
  import('./AdminProofsPage.tsx').then((m) => ({ default: m.AdminProofsPage })),
)
export const AdminAccountsPage = lazy(() =>
  import('./AdminAccountsPage.tsx').then((m) => ({ default: m.AdminAccountsPage })),
)
export const AdminOrganisationsPage = lazy(() =>
  import('./AdminOrganisationsPage.tsx').then((m) => ({ default: m.AdminOrganisationsPage })),
)
