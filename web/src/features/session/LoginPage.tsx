import { ChevronLeft, KeyRound, Loader2, MessageSquareText, Smartphone, Users } from 'lucide-react'
import { type FormEvent, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useSearchParams } from 'react-router'

import { type OtpSent, requestOtp, verifyOtp } from '../../api/endpoints.ts'
import { ApiError, errorCode } from '../../api/http.ts'
import { PATHS } from '../../paths.ts'
import { ErrorMessage } from '../../ui/common.tsx'
import { Logo } from '../../ui/Logo.tsx'
import { useFocusOnMount } from '../../ui/useFocusOnMount.ts'
import { OTP_LENGTH, cleanCode, formatPhone, isSenegalMobile, nextPath } from './login.ts'
import { saveSession } from './session.ts'

// Connexion par code SMS (étape 1 post-MVP) : numéro, puis code à 6 chiffres. Le premier
// passage crée un compte citoyen ; collecteurs et admins ont un compte créé à l'avance.

interface Failure {
  code: string
  remaining?: number
}

function toFailure(error: unknown): Failure {
  const code = errorCode(error)
  const remaining = error instanceof ApiError ? error.details.remaining_attempts : undefined
  return { code, remaining: typeof remaining === 'number' ? remaining : undefined }
}

const INPUT =
  'min-h-12 w-full rounded-xl border-2 border-line bg-surface px-4 text-lg text-ink focus:border-brand-600 focus:outline-none'
const PRIMARY =
  'flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-5 font-bold text-white disabled:opacity-50'
const LINK_BUTTON = 'min-h-11 self-start font-semibold text-brand-600 underline disabled:no-underline disabled:opacity-60'

export function LoginPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const titleRef = useFocusOnMount<HTMLHeadingElement>()
  const [phone, setPhone] = useState('')
  const [sent, setSent] = useState<OtpSent | null>(null)
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [pending, setPending] = useState(false)
  const [failure, setFailure] = useState<Failure | null>(null)
  const [wait, setWait] = useState(0)

  // Compte à rebours avant de pouvoir redemander un code.
  useEffect(() => {
    if (wait <= 0) return
    const timer = setTimeout(() => setWait((value) => value - 1), 1000)
    return () => clearTimeout(timer)
  }, [wait])

  const demoLink = params.get('next')
    ? `${PATHS.demo}?next=${encodeURIComponent(params.get('next') ?? '')}`
    : PATHS.demo

  async function sendCode(event?: FormEvent) {
    event?.preventDefault()
    if (!isSenegalMobile(phone) || pending) return
    setPending(true)
    setFailure(null)
    try {
      const result = await requestOtp(phone)
      setSent(result)
      setCode('')
      setWait(result.resendIn)
    } catch (error) {
      const failed = toFailure(error)
      const retry = error instanceof ApiError ? error.details.retry_after : undefined
      if (typeof retry === 'number') setWait(retry)
      setFailure(failed)
    } finally {
      setPending(false)
    }
  }

  async function login(event: FormEvent) {
    event.preventDefault()
    if (!sent || code.length !== OTP_LENGTH || pending) return
    setPending(true)
    setFailure(null)
    try {
      const { token, user } = await verifyOtp(sent.phone, code, name)
      saveSession(token, user, { persist: true })
      void navigate(nextPath(params.get('next'), user.role), { replace: true })
    } catch (error) {
      setFailure(toFailure(error))
      setCode('')
    } finally {
      setPending(false)
    }
  }

  function changePhone() {
    setSent(null)
    setCode('')
    setFailure(null)
  }

  const phoneValid = isSenegalMobile(phone)

  // Affichée juste sous le champ concerné, pour rester visible sur un petit écran.
  const failureView =
    failure &&
    (failure.code === 'OTP_INVALID' && failure.remaining !== undefined ? (
      <p role="alert" className="rounded-2xl border border-danger/40 border-l-4 border-l-danger bg-white p-4 text-ink shadow-card">
        {t('login.wrongCode', { count: failure.remaining })}
      </p>
    ) : (
      <ErrorMessage code={failure.code} />
    ))

  return (
    <div className="min-h-dvh bg-surface">
      <div className="relative overflow-hidden bg-gradient-to-br from-brand-950 to-brand-700 px-4 pt-6 pb-24 text-white">
        <div aria-hidden="true" className="absolute inset-0 bg-dots" />
        <div className="relative mx-auto flex max-w-lg flex-col gap-4">
          <Link to={PATHS.home} className="flex min-h-11 w-fit items-center gap-1 font-semibold text-mint">
            <ChevronLeft aria-hidden="true" className="size-5" />
            {t('citizen.back')}
          </Link>
          <Logo className="size-14 rounded-2xl shadow-card" />
          <h1 ref={titleRef} tabIndex={-1} className="text-3xl font-extrabold tracking-tight focus:outline-none">
            {t('login.title')}
          </h1>
          <p className="text-mint">{t('login.intro')}</p>
        </div>
      </div>
      <main className="relative mx-auto -mt-16 flex max-w-lg animate-fade-up flex-col gap-5 px-4 pb-10">
        <div className="flex flex-col gap-5 rounded-3xl border border-line bg-white p-5 shadow-lift">

      {!sent ? (
        <form onSubmit={(event) => void sendCode(event)} className="flex flex-col gap-3" noValidate>
          <label htmlFor="login-phone" className="flex items-center gap-2 font-bold text-ink">
            <Smartphone aria-hidden="true" className="size-5 text-brand-600" />
            {t('login.phoneLabel')}
          </label>
          <div className="flex items-center gap-2">
            <span className="flex min-h-12 items-center rounded-xl bg-mint px-3 font-bold text-brand-900">
              +221
            </span>
            <input
              id="login-phone"
              type="tel"
              inputMode="numeric"
              autoComplete="tel-national"
              placeholder="77 123 45 67"
              value={phone}
              onChange={(event) => setPhone(formatPhone(event.target.value))}
              aria-describedby="login-phone-hint"
              className={INPUT}
            />
          </div>
          <p id="login-phone-hint" className="text-sm text-muted">
            {phone && !phoneValid ? t('login.phoneInvalid') : t('login.phoneHint')}
          </p>
          {failureView}
          <button type="submit" disabled={!phoneValid || pending || wait > 0} className={PRIMARY}>
            {pending ? (
              <Loader2 aria-hidden="true" className="size-5 animate-spin" />
            ) : (
              <MessageSquareText aria-hidden="true" className="size-5" />
            )}
            {wait > 0 ? t('login.resendIn', { seconds: wait }) : t('login.sendCode')}
          </button>
        </form>
      ) : (
        <form onSubmit={(event) => void login(event)} className="flex flex-col gap-3" noValidate>
          <p role="status" className="rounded-xl bg-mint p-3 text-brand-900">
            {t('login.codeSent', { phone: `+221 ${formatPhone(sent.phone)}` })}
          </p>
          {sent.devCode && (
            <p className="rounded-xl border-2 border-dashed border-warning-ink p-3 text-sm font-semibold text-warning-ink">
              {t('login.testMode', { code: sent.devCode })}
            </p>
          )}
          <label htmlFor="login-code" className="flex items-center gap-2 font-bold text-ink">
            <KeyRound aria-hidden="true" className="size-5 text-brand-600" />
            {t('login.codeLabel')}
          </label>
          <input
            id="login-code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={OTP_LENGTH + 2}
            placeholder="••••••"
            value={code}
            onChange={(event) => setCode(cleanCode(event.target.value))}
            className={`${INPUT} text-center text-2xl tracking-[0.5em]`}
            autoFocus
          />
          {failureView}
          <label htmlFor="login-name" className="font-bold text-ink">
            {t('login.nameLabel')}
          </label>
          <input
            id="login-name"
            type="text"
            autoComplete="given-name"
            maxLength={80}
            value={name}
            onChange={(event) => setName(event.target.value)}
            aria-describedby="login-name-hint"
            className={INPUT}
          />
          <p id="login-name-hint" className="text-sm text-muted">
            {t('login.nameHint')}
          </p>
          <button type="submit" disabled={code.length !== OTP_LENGTH || pending} className={PRIMARY}>
            {pending && <Loader2 aria-hidden="true" className="size-5 animate-spin" />}
            {t('login.submit')}
          </button>
          <button
            type="button"
            onClick={() => void sendCode()}
            disabled={wait > 0 || pending}
            className={LINK_BUTTON}
          >
            {wait > 0 ? t('login.resendIn', { seconds: wait }) : t('login.resend')}
          </button>
          <button type="button" onClick={changePhone} className={LINK_BUTTON}>
            {t('login.changePhone')}
          </button>
        </form>
      )}

      <Link
        to={demoLink}
        className="mt-auto flex min-h-11 items-center justify-center gap-2 rounded-xl border-2 border-line px-4 font-semibold text-brand-600"
      >
        <Users aria-hidden="true" className="size-5" />
        {t('login.demo')}
      </Link>
        </div>
      </main>
    </div>
  )
}
