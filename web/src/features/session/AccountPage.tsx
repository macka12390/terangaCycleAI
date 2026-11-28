import { BellOff, BellRing, Building2, ChevronLeft, Loader2, LogOut, Smartphone } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, Navigate, useNavigate } from 'react-router'

import { updateMe } from '../../api/endpoints.ts'
import { errorCode } from '../../api/http.ts'
import type { User } from '../../api/types.ts'
import { PATHS } from '../../paths.ts'
import { DemoTag, ErrorMessage } from '../../ui/common.tsx'
import { Logo } from '../../ui/Logo.tsx'
import { displayPhone } from '../admin/accounts.ts'
import { HOME } from './login.ts'
import { clearSession, getToken, getUser, saveSession } from './session.ts'

// Mon compte (étape 4) : nom, numéro, organisation, et choix des SMS de suivi.
// Les comptes de démonstration sont en lecture seule.

export function AccountPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [user, setUser] = useState<User | null>(getUser())
  const [name, setName] = useState(user?.name ?? '')
  const [pending, setPending] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [failure, setFailure] = useState<string | null>(null)

  if (!user) return <Navigate to={`${PATHS.login}?next=${encodeURIComponent(PATHS.account)}`} replace />
  const editable = !user.demo_login
  const smsOn = user.sms_notifications !== false

  async function save(changes: { name?: string; sms_notifications?: boolean }, message: string) {
    const token = getToken()
    if (!token) return
    setPending(true)
    setFailure(null)
    setNotice(null)
    try {
      const updated = await updateMe(changes)
      saveSession(token, updated, { persist: !updated.demo_login })
      setUser(updated)
      setNotice(message)
    } catch (error) {
      setFailure(errorCode(error))
    } finally {
      setPending(false)
    }
  }

  function submitName(event: FormEvent) {
    event.preventDefault()
    if (name.trim() && name.trim() !== user?.name) void save({ name: name.trim() }, t('account.nameSaved'))
  }

  return (
    <div className="min-h-dvh bg-surface">
      <div className="relative overflow-hidden bg-gradient-to-br from-brand-950 to-brand-700 px-4 pt-6 pb-24 text-white">
        <div aria-hidden="true" className="absolute inset-0 bg-dots" />
        <div className="relative mx-auto flex max-w-lg flex-col gap-4">
          <Link to={HOME[user.role]} className="flex min-h-11 w-fit items-center gap-1 font-semibold text-mint">
            <ChevronLeft aria-hidden="true" className="size-5" />
            {t('citizen.back')}
          </Link>
          <Logo className="size-14 rounded-2xl shadow-card" />
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-extrabold tracking-tight">{t('account.title')}</h1>
            {user.is_demo && <DemoTag />}
          </div>
        </div>
      </div>
      <main className="relative mx-auto -mt-16 flex max-w-lg animate-fade-up flex-col gap-5 px-4 pb-10">
        <div className="flex flex-col gap-5 rounded-3xl border border-line bg-white p-5 shadow-lift">

      {notice && <p role="status" className="rounded-2xl bg-mint p-4 font-semibold text-brand-900">{notice}</p>}
      {failure && <ErrorMessage code={failure} />}

      <dl className="flex flex-col gap-2 rounded-3xl border border-line bg-white p-5 shadow-card text-ink">
        <div className="flex items-center gap-2">
          <dt className="sr-only">{t('account.role')}</dt>
          <dd className="rounded-full bg-mint px-2 py-0.5 text-xs font-bold text-brand-900">
            {t(`admin.accounts.roles.${user.role}`)}
          </dd>
        </div>
        <div className="flex items-center gap-2">
          <Smartphone aria-hidden="true" className="size-5 text-brand-600" />
          <dt className="sr-only">{t('account.phone')}</dt>
          <dd className="font-mono">{displayPhone(user.phone)}</dd>
        </div>
        {user.organisation && (
          <div className="flex items-center gap-2">
            <Building2 aria-hidden="true" className="size-5 text-brand-600" />
            <dt className="sr-only">{t('account.organisation')}</dt>
            <dd>{user.organisation.name}</dd>
          </div>
        )}
      </dl>

      {editable ? (
        <>
          <form onSubmit={submitName} className="flex flex-col gap-2">
            <label htmlFor="account-name" className="font-bold text-ink">{t('account.name')}</label>
            <div className="flex gap-2">
              <input
                id="account-name"
                value={name}
                maxLength={80}
                onChange={(event) => setName(event.target.value)}
                className="min-h-11 flex-1 rounded-xl border border-line bg-white px-3 text-ink shadow-sm focus:border-brand-600 focus:outline-none"
              />
              <button
                type="submit"
                disabled={pending || !name.trim() || name.trim() === user.name}
                className="min-h-11 rounded-xl bg-gradient-to-r from-brand-900 to-brand-600 px-4 font-bold text-white shadow-card transition hover:shadow-lift disabled:opacity-50"
              >
                {t('account.save')}
              </button>
            </div>
          </form>

          <section aria-labelledby="sms-title" className="flex flex-col gap-3 rounded-3xl border border-line bg-white p-5 shadow-card">
            <h2 id="sms-title" className="flex items-center gap-2 font-bold text-ink">
              {smsOn ? (
                <BellRing aria-hidden="true" className="size-5 text-brand-600" />
              ) : (
                <BellOff aria-hidden="true" className="size-5 text-muted" />
              )}
              {t('account.sms.title')}
            </h2>
            <p className="text-sm text-muted">{t(`account.sms.body.${user.role}`)}</p>
            <button
              type="button"
              role="switch"
              aria-checked={smsOn}
              disabled={pending}
              onClick={() =>
                void save(
                  { sms_notifications: !smsOn },
                  t(smsOn ? 'account.sms.turnedOff' : 'account.sms.turnedOn'),
                )
              }
              className={`flex min-h-12 items-center justify-center gap-2 rounded-xl px-4 font-bold disabled:opacity-50 ${
                smsOn ? 'border-2 border-line text-ink' : 'bg-brand-600 text-white'
              }`}
            >
              {pending && <Loader2 aria-hidden="true" className="size-5 animate-spin" />}
              {t(smsOn ? 'account.sms.turnOff' : 'account.sms.turnOn')}
            </button>
          </section>
        </>
      ) : (
        <p className="rounded-3xl border-2 border-dashed border-line bg-white/60 p-8 text-center text-muted">{t('account.demo')}</p>
      )}

      <button
        type="button"
        onClick={() => {
          clearSession()
          void navigate(PATHS.home, { replace: true })
        }}
        className="mt-auto flex min-h-11 items-center justify-center gap-2 rounded-xl border-2 border-line px-4 font-semibold text-brand-600"
      >
        <LogOut aria-hidden="true" className="size-5" />
        {t('admin.logout')}
      </button>
        </div>
      </main>
    </div>
  )
}
