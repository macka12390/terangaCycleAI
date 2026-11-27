import { CircleUserRound, LogOut } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link, NavLink, Outlet, useNavigate } from 'react-router'

import { PATHS } from '../../paths.ts'
import { DemoTag } from '../../ui/common.tsx'
import { Logo } from '../../ui/Logo.tsx'
import { clearSession, getUser } from '../session/session.ts'

// Espace collecteur (§8.3), mobile d'abord : en-tête compact avec le nom et la sortie.
export function CollectorLayout() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const user = getUser()

  return (
    <div className="flex min-h-dvh flex-col bg-surface">
      <header className="bg-brand-900 px-4 py-3 text-surface">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">
          <span className="flex items-center gap-2 font-bold">
            <Logo className="size-8 shrink-0" />
            {user?.name}
            {user?.is_demo && <DemoTag />}
          </span>
          <Link to={PATHS.account} className="ml-auto flex min-h-11 items-center gap-1 font-semibold text-mint">
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
            className="flex min-h-11 items-center gap-2 font-semibold text-mint"
          >
            <LogOut aria-hidden="true" className="size-5" />
            <span className="sr-only sm:not-sr-only">{t('admin.logout')}</span>
          </button>
        </div>
      </header>
      <nav aria-label={t('lots.collector.nav')} className="border-b border-line bg-surface">
        <ul className="mx-auto flex max-w-2xl gap-1 px-4">
          {[
            { to: PATHS.collector, label: t('lots.collector.navMissions') },
            { to: PATHS.collectorLots, label: t('lots.collector.navLots') },
            { to: PATHS.collectorEarnings, label: t('payments.collector.nav') },
          ].map((link) => (
            <li key={link.to}>
              <NavLink
                to={link.to}
                className={({ isActive }) =>
                  `flex min-h-11 items-center border-b-4 px-3 font-semibold ${
                    isActive ? 'border-brand-600 text-brand-900' : 'border-transparent text-muted'
                  }`
                }
              >
                {link.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <main className="mx-auto w-full max-w-2xl flex-1 p-4">
        <Outlet />
      </main>
    </div>
  )
}
