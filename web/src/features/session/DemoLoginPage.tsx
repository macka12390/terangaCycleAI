import { BadgeCheck, ChevronLeft, Crown, Loader2, ShieldCheck, Truck, UserRound } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useSearchParams } from 'react-router'

import { demoAccounts, demoLogin } from '../../api/endpoints.ts'
import { errorCode } from '../../api/http.ts'
import type { Role, User } from '../../api/types.ts'
import { PATHS } from '../../paths.ts'
import { DemoTag, ErrorMessage, Loading } from '../../ui/common.tsx'
import { useLoad } from '../../ui/load.ts'
import { nextPath } from './login.ts'
import { saveSession } from './session.ts'

// Comptes de démonstration (cahier des charges §2) : la liste vient de l'API
// (GET /api/auth/demo-accounts) ; un toucher ouvre l'espace du rôle. Comptes fictifs.

const ICON: Record<Role, typeof UserRound> = {
  citizen: UserRound,
  collector: Truck,
  admin: ShieldCheck,
  superadmin: Crown,
}

export function DemoLoginPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { load, reload } = useLoad(demoAccounts)
  const [pending, setPending] = useState<string | null>(null)
  const [failure, setFailure] = useState<string | null>(null)

  async function choose(account: User) {
    if (!account.demo_login) return
    setPending(account.demo_login)
    setFailure(null)
    try {
      const { token, user } = await demoLogin(account.demo_login)
      saveSession(token, user)
      void navigate(nextPath(params.get('next'), user.role), { replace: true })
    } catch (error) {
      setFailure(errorCode(error))
    } finally {
      setPending(null)
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col gap-5 px-4 py-6">
      <Link to={PATHS.home} className="flex min-h-11 items-center gap-1 font-semibold text-brand-600">
        <ChevronLeft aria-hidden="true" className="size-5" />
        {t('citizen.back')}
      </Link>
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold text-brand-900">{t('demoLogin.title')}</h1>
        <DemoTag />
      </div>
      <p className="text-ink">{t('demoLogin.intro')}</p>
      {load.state === 'loading' && <Loading />}
      {load.state === 'error' && <ErrorMessage code={load.code} onRetry={reload} />}
      {load.state === 'ready' && load.data.length === 0 && (
        <div className="flex flex-col gap-3 rounded-xl border-2 border-line p-4">
          <p className="text-ink">{t('demoLogin.disabled')}</p>
          <Link to={PATHS.login} className="font-bold text-brand-600 underline">
            {t('demoLogin.useSms')}
          </Link>
        </div>
      )}
      {load.state === 'ready' && load.data.length > 0 && (
        <ul className="flex flex-col gap-3">
          {load.data.map((account) => {
            const Icon = ICON[account.role]
            return (
              <li key={account.demo_login ?? account.id}>
                <button
                  type="button"
                  onClick={() => void choose(account)}
                  disabled={pending !== null}
                  className="flex w-full items-center gap-4 rounded-2xl border-2 border-line bg-surface p-4 text-left hover:border-brand-600 disabled:opacity-60"
                >
                  <span className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-mint text-brand-600">
                    {pending === account.demo_login ? (
                      <Loader2 aria-hidden="true" className="size-7 animate-spin" />
                    ) : (
                      <Icon aria-hidden="true" className="size-7" />
                    )}
                  </span>
                  <span className="flex flex-col">
                    <span className="text-lg font-bold text-ink">{account.name}</span>
                    <span className="text-sm text-muted">{t(`demoLogin.roles.${account.role}.body`)}</span>
                    {account.role === 'collector' && (
                      <span className={`mt-1 flex items-center gap-1 text-xs font-bold ${account.is_verified ? 'text-brand-600' : 'text-warning-ink'}`}>
                        {account.is_verified && <BadgeCheck aria-hidden="true" className="size-4" />}
                        {t(account.is_verified ? 'demoLogin.verified' : 'demoLogin.notVerified')}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {failure && <ErrorMessage code={failure} />}
    </main>
  )
}
