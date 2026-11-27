import { BarChart3, ClipboardCheck, LogOut, Map, Recycle, ShieldCheck, Truck } from 'lucide-react'
import { Suspense } from 'react'
import { useTranslation } from 'react-i18next'
import { NavLink, Outlet, useNavigate } from 'react-router'

import { PATHS } from '../../paths.ts'
import { DemoTag, Loading } from '../../ui/common.tsx'
import { clearSession, getUser } from '../session/session.ts'

// Console administrateur (cahier des charges §8.4) : barre latérale, en-tête avec profil.
// Sur téléphone, la barre devient une rangée d'onglets défilante.

const LINKS = [
  { to: PATHS.admin, key: 'dashboard', Icon: BarChart3, end: true },
  { to: PATHS.adminReports, key: 'reports', Icon: ShieldCheck, end: false },
  { to: PATHS.adminMissions, key: 'missions', Icon: Truck, end: false },
  { to: PATHS.adminProofs, key: 'proofs', Icon: ClipboardCheck, end: false },
  { to: PATHS.adminMap, key: 'map', Icon: Map, end: false },
] as const

export function AdminLayout() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const user = getUser()

  function logout() {
    clearSession()
    void navigate(PATHS.home, { replace: true })
  }

  return (
    <div className="flex min-h-dvh flex-col bg-surface md:flex-row">
      <aside className="bg-brand-900 text-surface md:w-64 md:shrink-0">
        <div className="flex items-center gap-2 px-4 py-4 text-lg font-bold">
          <Recycle aria-hidden="true" className="size-6 text-accent" />
          TerangaCycle AI
        </div>
        <nav aria-label={t('admin.nav.label')}>
          <ul className="flex gap-1 overflow-x-auto px-2 pb-2 md:flex-col md:pb-4">
            {LINKS.map(({ to, key, Icon, end }) => (
              <li key={key} className="shrink-0">
                <NavLink
                  to={to}
                  end={end}
                  className={({ isActive }) =>
                    `flex min-h-11 items-center gap-3 rounded-xl px-3 font-semibold ${
                      isActive ? 'bg-surface text-brand-900' : 'text-mint hover:bg-brand-600'
                    }`
                  }
                >
                  <Icon aria-hidden="true" className="size-5" />
                  {t(`admin.nav.${key}`)}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <span className="flex items-center gap-2 font-semibold text-ink">
            {user?.name}
            {user?.is_demo && <DemoTag />}
          </span>
          <button
            type="button"
            onClick={logout}
            className="flex min-h-11 items-center gap-2 rounded-xl px-3 font-semibold text-brand-600"
          >
            <LogOut aria-hidden="true" className="size-5" />
            {t('admin.logout')}
          </button>
        </header>
        <main className="flex-1 p-4 md:p-6">
          <Suspense fallback={<Loading />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  )
}
