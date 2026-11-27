import { Suspense } from 'react'
import { Navigate, type RouteObject } from 'react-router'

import { CitizenReportPage } from './features/citizen/CitizenReportPage.tsx'
import { CollectorLayout } from './features/collector/CollectorLayout.tsx'
import { CollectorMissionPage } from './features/collector/CollectorMissionPage.tsx'
import { CollectorMissionsPage } from './features/collector/CollectorMissionsPage.tsx'
import { QrCodePage } from './features/citizen/QrCodePage.tsx'
import { TrackingPage } from './features/citizen/TrackingPage.tsx'
import { ConsentPage } from './features/consent/ConsentPage.tsx'
import { HomePage } from './features/home/HomePage.tsx'
import { NotFoundPage } from './features/not-found/NotFoundPage.tsx'
import { ReportEntry } from './features/report/ReportEntry.tsx'
import { DemoLoginPage } from './features/session/DemoLoginPage.tsx'
import { AccountPage } from './features/session/AccountPage.tsx'
import { LoginPage } from './features/session/LoginPage.tsx'
import { RequireRole } from './features/session/RequireRole.tsx'
import { PATHS } from './paths.ts'
import {
  AdminAccountsPage,
  AdminDashboard,
  AdminLayout,
  AdminMapPage,
  AdminMissionsPage,
  AdminNotificationsPage,
  AdminOrganisationsPage,
  AdminProofsPage,
  AdminReportsPage,
} from './features/admin/lazyPages.tsx'
import { AppLayout } from './ui/AppLayout.tsx'
import { Loading } from './ui/common.tsx'

// Table des routes, à part d'App.tsx : testable sous Node (App.test.tsx) et sans casser
// le rechargement à chaud (un module de composants n'exporte que des composants).
export const routes: RouteObject[] = [
  {
    // Bandeau « Mode démonstration » au-dessus de tous les écrans (story 2.1).
    element: <AppLayout />,
    children: [
      { path: PATHS.home, element: <HomePage /> },
      { path: PATHS.report, element: <ReportEntry /> },
      { path: '/citizen', element: <Navigate to={PATHS.citizenReport} replace /> },
      { path: PATHS.citizenReport, element: <CitizenReportPage /> },
      { path: PATHS.citizenQr, element: <QrCodePage /> },
      { path: PATHS.citizenTracking, element: <TrackingPage /> },
      { path: PATHS.consent, element: <ConsentPage /> },
      // Ancien parcours en trois écrans : remplacé par le formulaire en un écran.
      { path: '/signaler/*', element: <Navigate to={PATHS.citizenReport} replace /> },
      { path: PATHS.login, element: <LoginPage /> },
      { path: PATHS.account, element: <AccountPage /> },
      { path: PATHS.demo, element: <DemoLoginPage /> },
      {
        element: (
          <RequireRole role="collector">
            <CollectorLayout />
          </RequireRole>
        ),
        children: [
          { path: '/collector', element: <Navigate to={PATHS.collector} replace /> },
          { path: PATHS.collector, element: <CollectorMissionsPage /> },
          { path: PATHS.collectorMission, element: <CollectorMissionPage /> },
        ],
      },
      {
        element: (
          <RequireRole role="admin">
            <Suspense fallback={<Loading />}>
              <AdminLayout />
            </Suspense>
          </RequireRole>
        ),
        children: [
          { path: PATHS.admin, element: <AdminDashboard /> },
          { path: PATHS.adminReports, element: <AdminReportsPage /> },
          { path: PATHS.adminMissions, element: <AdminMissionsPage /> },
          { path: PATHS.adminProofs, element: <AdminProofsPage /> },
          { path: PATHS.adminMap, element: <AdminMapPage /> },
          { path: PATHS.adminAccounts, element: <AdminAccountsPage /> },
          { path: PATHS.adminOrganisations, element: <AdminOrganisationsPage /> },
          { path: PATHS.adminNotifications, element: <AdminNotificationsPage /> },
        ],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]
