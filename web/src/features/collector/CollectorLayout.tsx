import { CircleUserRound, LogOut } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link, NavLink, Outlet, useNavigate } from 'react-router'

import { PATHS } from '../../paths.ts'
import { DemoTag } from '../../ui/common.tsx'
import { Logo } from '../../ui/Logo.tsx'
import { clearSession, getUser } from '../session/session.ts'

// Espace collecteur (§8.3), mobile d'abord : en-tête compact (logo, nom, compte, sortie)
// et onglets missions, lots, gains.
export function CollectorLayout() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const user = getUser()

  return (
    <div className="flex min-h-dvh flex-col bg-surface">
      <header className="relative overflow-hidden bg-gradient-to-br from-brand-950 to-brand-700 px-4 py-3 text-white shadow-card">
        <div aria-hidden="true" className="absolute inset-0 bg-dots" />
        <div className="relative mx-auto flex max-w-2xl items-center gap-2">
          <span className="flex min-w-0 flex-1 items-center gap-3 font-bold">
            <Logo className="size-11 shrink-0 rounded-xl shadow-card" />
            <span className="truncate">{user?.name}</span>
            {user?.is_demo && (
              <span className="hidden sm:inline">
                <DemoTag />
              </span>
            )}
          </span>
          <Link
            to={PATHS.account}
            className="flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-1 rounded-xl px-2 font-semibold text-mint transition hover:bg-white/10"
          >
            <CircleUserRound aria-hidden="true" className="size-5" />
            {/* Sur téléphone : icône seule, libellé gardé pour les lecteurs d'écran. */}
            <span className="sr-only sm:not-sr-only">{t('account.link')}</span>
          </Link>
          <button
            type="button"
            onClick={() => {
              clearSession()
              void navigate(PATHS.home, { replace: true })
            }}
            className="flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-2 rounded-xl px-2 font-semibold text-mint transition hover:bg-white/10"
          >
            <LogOut aria-hidden="true" className="size-5" />
            <span className="sr-only sm:not-sr-only">{t('admin.logout')}</span>
          </button>
        </div>
      </header>
      <nav aria-label={t('lots.collector.nav')} className="sticky top-0 z-[500] border-b border-line bg-white/95 backdrop-blur">
        <ul className="mx-auto flex max-w-2xl gap-1 overflow-x-auto px-4">
          {[
            { to: PATHS.collector, label: t('lots.collector.navMissions') },
            { to: PATHS.collectorLots, label: t('lots.collector.navLots') },
            { to: PATHS.collectorEarnings, label: t('payments.collector.nav') },
          ].map((link) => (
            <li key={link.to} className="shrink-0">
              <NavLink
                to={link.to}
                className={({ isActive }) =>
                  `flex min-h-12 items-center border-b-4 px-3 font-semibold transition ${
                    isActive ? 'border-brand-600 text-brand-900' : 'border-transparent text-muted hover:text-ink'
                  }`
                }
              >
                {link.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <main className="mx-auto w-full max-w-2xl flex-1 animate-fade-up p-4 py-6">
        <Outlet />
      </main>
    </div>
  )
}
