import { LogOut, Recycle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Outlet, useNavigate } from 'react-router'

import { PATHS } from '../../paths.ts'
import { DemoTag } from '../../ui/common.tsx'
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
            <Recycle aria-hidden="true" className="size-6 text-accent" />
            {user?.name}
            {user?.is_demo && <DemoTag />}
          </span>
          <button
            type="button"
            onClick={() => {
              clearSession()
              void navigate(PATHS.home, { replace: true })
            }}
            className="flex min-h-11 items-center gap-2 font-semibold text-mint"
          >
            <LogOut aria-hidden="true" className="size-5" />
            {t('admin.logout')}
          </button>
        </div>
      </header>
      <main className="mx-auto w-full max-w-2xl flex-1 p-4">
        <Outlet />
      </main>
    </div>
  )
}
