import {
  Banknote,
  BarChart3,
  Building2,
  CircleUserRound,
  ClipboardCheck,
  LogOut,
  Map,
  MessageSquareText,
  Package,
  ShieldCheck,
  Truck,
  UsersRound,
} from 'lucide-react'
import { Suspense } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, NavLink, Outlet, useNavigate } from 'react-router'

import { PATHS } from '../../paths.ts'
import { DemoTag, Loading } from '../../ui/common.tsx'
import { Logo } from '../../ui/Logo.tsx'
import { clearSession, getUser } from '../session/session.ts'

// Console administrateur (cahier des charges §8.4) : barre latérale, en-tête avec profil.
// Sur téléphone, la barre devient une rangée d'onglets défilante.

const LINKS = [
  { to: PATHS.admin, key: 'dashboard', Icon: BarChart3, end: true },
  { to: PATHS.adminReports, key: 'reports', Icon: ShieldCheck, end: false },
  { to: PATHS.adminMissions, key: 'missions', Icon: Truck, end: false },
  { to: PATHS.adminProofs, key: 'proofs', Icon: ClipboardCheck, end: false },
  { to: PATHS.adminMap, key: 'map', Icon: Map, end: false },
  { to: PATHS.adminAccounts, key: 'accounts', Icon: UsersRound, end: false },
  { to: PATHS.adminLots, key: 'lots', Icon: Package, end: false },
  { to: PATHS.adminPayments, key: 'payments', Icon: Banknote, end: false },
  { to: PATHS.adminNotifications, key: 'notifications', Icon: MessageSquareText, end: false },
  { to: PATHS.adminOrganisations, key: 'organisations', Icon: Building2, end: false, superadminOnly: true },
] as const

export function AdminLayout() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const user = getUser()

  function logout() {
    clearSession()
    void navigate(PATHS.home, { replace: true })
  }

  const initials = (user?.name ?? '?')
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')

  return (
    <div className="flex min-h-dvh flex-col bg-surface md:flex-row">
      <aside className="relative overflow-hidden bg-gradient-to-b from-brand-950 to-brand-900 text-white md:sticky md:top-0 md:flex md:h-dvh md:w-72 md:shrink-0 md:flex-col">
        <div aria-hidden="true" className="absolute inset-0 bg-dots opacity-60" />
        <div className="relative flex items-center gap-3 px-5 py-5">
          <Logo className="size-12 shrink-0 rounded-xl shadow-card" />
          <span className="flex flex-col leading-tight">
            <span className="text-lg font-extrabold">TerangaCycle</span>
            <span className="text-xs font-semibold text-mint">{t('admin.console')}</span>
          </span>
        </div>
        <nav aria-label={t('admin.nav.label')} className="relative md:min-h-0 md:flex-1 md:overflow-y-auto">
          <ul className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-col md:pb-4">
            {LINKS.filter((link) => !('superadminOnly' in link) || user?.role === 'superadmin').map(({ to, key, Icon, end }) => (
              <li key={key} className="shrink-0">
                <NavLink
                  to={to}
                  end={end}
                  className={({ isActive }) =>
                    `flex min-h-12 items-center gap-3 rounded-2xl px-4 font-semibold transition ${
                      isActive
                        ? 'bg-white text-brand-900 shadow-card'
                        : 'text-mint hover:bg-white/10 hover:text-white'
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
        <header className="sticky top-0 z-[500] flex items-center justify-between gap-3 border-b border-line bg-white/90 px-4 py-3 backdrop-blur md:px-8">
          <span className="flex min-w-0 items-center gap-3 font-semibold text-ink">
            <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-600 to-brand-900 text-sm font-bold text-white">
              {initials}
            </span>
            <span className="flex min-w-0 flex-col leading-tight">
              <span className="truncate">{user?.name}</span>
              <span className="hidden items-center gap-1 text-xs font-normal text-muted sm:flex">
                {user?.organisation ? (
                  <>
                    <Building2 aria-hidden="true" className="size-3.5" />
                    {user.organisation.name}
                  </>
                ) : (
                  t('admin.role')
                )}
              </span>
            </span>
            {user?.is_demo && (
              <span className="hidden sm:inline">
                <DemoTag />
              </span>
            )}
          </span>
          <Link
            to={PATHS.account}
            aria-label={t('account.link')}
            className="ml-auto flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-2 rounded-xl px-3 font-semibold text-brand-600 transition hover:bg-mint"
          >
            <CircleUserRound aria-hidden="true" className="size-5" />
            <span className="hidden sm:inline">{t('account.link')}</span>
          </Link>
          <button
            type="button"
            onClick={logout}
            aria-label={t('admin.logout')}
            className="flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-2 rounded-xl px-3 font-semibold text-brand-600 transition hover:bg-mint"
          >
            <LogOut aria-hidden="true" className="size-5" />
            <span className="hidden sm:inline">{t('admin.logout')}</span>
          </button>
        </header>
        <main className="flex-1 animate-fade-up p-4 md:p-8">
          <div className="mx-auto flex max-w-6xl flex-col gap-6">
            <Suspense fallback={<Loading />}>
              <Outlet />
            </Suspense>
          </div>
        </main>
      </div>
    </div>
  )
}
