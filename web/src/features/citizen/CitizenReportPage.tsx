import {
  CircleUserRound,
  Camera,
  CheckCircle2,
  ChevronLeft,
  CloudOff,
  Loader2,
  MapPin,
  QrCode,
  Recycle,
  RotateCcw,
  Send,
  Sparkles,
  Tag,
  X,
} from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, Navigate } from 'react-router'

import { classify, createReport, type CreatedReport, type NewReport } from '../../api/endpoints.ts'
import { ApiError, errorCode } from '../../api/http.ts'
import type { Ai } from '../../api/types.ts'
import { enqueue, flush, pendingCount } from '../../offline/outbox.ts'
import { PATHS } from '../../paths.ts'
import { getUser } from '../session/session.ts'
import { PhotoPicker } from '../../ui/PhotoPicker.tsx'
import { AiPanel } from '../classify/AiPanel.tsx'
import { WasteTypePicker } from '../classify/WasteTypePicker.tsx'
import type { WasteType } from '../classify/wasteTypes.ts'
import { useCurrentConsent } from '../consent/useCurrentConsent.ts'
import { Composer } from '../report/Composer.tsx'
import { browserCodec, preparePhoto } from '../report/photo.ts'

// Espace citoyen · Signaler un dépôt (modèle « Signal citoyen » de SenAlerte), branché sur
// l'API Flask (docs/api-contract.md) : photo (appareil photo ou galerie, allégée et sans
// métadonnées), position GPS (obligatoire, jamais inventée), proposition de l'IA affichée
// avant l'envoi (POST /api/ai/classify, préremplie seulement à 60 % ou plus, avec son
// libellé), description écrite ou vocale, puis envoi et numéro de suivi. Sans réseau, le
// signalement est gardé sur le téléphone et envoyé au retour du réseau.

type Position =
  | { state: 'locating' }
  | { state: 'located'; lat: number; lng: number; accuracy: number }
  | { state: 'error'; reason: 'denied' | 'unavailable' | 'insecure' }

type Photo =
  | { state: 'none' }
  | { state: 'processing' }
  | { state: 'unreadable' }
  | { state: 'ready'; blob: Blob; url: string }

type Suggestion = { state: 'idle' } | { state: 'loading' } | { state: 'ready'; ai: Ai }

type ErrorKey = 'citizen.errors.network' | 'citizen.errors.photo' | 'citizen.errors.generic'

function errorKey(code: string): ErrorKey {
  if (code === 'network') return 'citizen.errors.network'
  if (code === 'FILE_TOO_LARGE' || code === 'UNSUPPORTED_FILE') return 'citizen.errors.photo'
  return 'citizen.errors.generic'
}

const isNetworkError = (error: unknown) =>
  !(error instanceof ApiError) || error.code === 'network' || error.status >= 500

/** Hors HTTPS (adresse IP du réseau local), le navigateur refuse la géolocalisation. */
function initialPosition(): Position {
  if (!window.isSecureContext) return { state: 'error', reason: 'insecure' }
  if (!('geolocation' in navigator)) return { state: 'error', reason: 'unavailable' }
  return { state: 'locating' }
}

function useGps(): { position: Position; locate: () => void } {
  const [position, setPosition] = useState<Position>(initialPosition)

  function request() {
    if (initialPosition().state === 'error') return
    navigator.geolocation.getCurrentPosition(
      (fix) =>
        setPosition({
          state: 'located',
          lat: fix.coords.latitude,
          lng: fix.coords.longitude,
          accuracy: fix.coords.accuracy,
        }),
      (error) =>
        setPosition({ state: 'error', reason: error.code === 1 ? 'denied' : 'unavailable' }),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    )
  }

  function locate() {
    setPosition(initialPosition())
    request()
  }

  // Première mesure au montage : seule la réponse du GPS met l'état à jour.
  useEffect(request, [])
  return { position, locate }
}

/** Signalements en attente : compte, envoi au retour du réseau, envoi à la demande. */
function useOutbox() {
  const [pending, setPending] = useState(0)
  const [sentNumbers, setSentNumbers] = useState<string[]>([])
  const [flushing, setFlushing] = useState(false)

  async function sendNow() {
    setFlushing(true)
    try {
      const result = await flush(createReport, isNetworkError)
      if (result.sent.length > 0) {
        const numbers = result.sent.map((created) => created.report.tracking_number)
        setSentNumbers((previous) => [...previous, ...numbers])
      }
    } finally {
      setPending(await pendingCount())
      setFlushing(false)
    }
  }

  useEffect(() => {
    let active = true
    // Au montage : compte, puis envoi de ce qui attendait (réseau revenu entre-temps).
    void pendingCount().then((count) => {
      if (!active) return
      setPending(count)
      if (count > 0 && navigator.onLine) void sendNow()
    })
    const onOnline = () => void sendNow()
    window.addEventListener('online', onOnline)
    return () => {
      active = false
      window.removeEventListener('online', onOnline)
    }
    // sendNow ne lit que des fonctions stables (setters, modules).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function keep(report: NewReport) {
    await enqueue(report)
    setPending(await pendingCount())
  }

  return { pending, sentNumbers, flushing, sendNow, keep }
}

function Section({
  icon,
  title,
  optional,
  children,
}: {
  icon: ReactNode
  title: string
  optional?: boolean
  children: ReactNode
}) {
  const { t } = useTranslation()
  return (
    <section className="flex flex-col gap-2">
      <h2 className="flex items-center gap-2 text-sm font-bold text-ink">
        {icon}
        {title}
        {optional && <span className="font-normal text-muted">{t('details.optional')}</span>}
      </h2>
      {children}
    </section>
  )
}

function Success({ created, onNew }: { created: CreatedReport; onNew: () => void }) {
  const { t } = useTranslation()
  const ai = created.ai ?? created.report.ai
  return (
    <div className="flex min-h-dvh items-center justify-center bg-gradient-to-br from-brand-600 to-brand-900 p-4">
      <div className="w-full max-w-md rounded-3xl bg-surface p-8 text-center shadow-2xl">
        <CheckCircle2 aria-hidden="true" className="mx-auto mb-4 size-20 text-brand-600" />
        <h1 className="mb-2 text-2xl font-bold text-ink">{t('citizen.success.title')}</h1>
        <p className="mb-6 text-muted">{t('citizen.success.body')}</p>

        <div className="mb-4 rounded-xl bg-mint p-4">
          <p className="text-sm font-semibold text-brand-900">{t('confirmation.trackingLabel')}</p>
          <p className="mt-1 font-mono text-2xl font-bold tracking-wide text-brand-900">
            {created.report.tracking_number}
          </p>
          <p className="mt-1 text-sm text-brand-900">{created.report.status_label}</p>
        </div>

        {ai && (
          <div className="mb-6 flex flex-col gap-2 rounded-xl border border-line p-4 text-left">
            <p className="text-sm font-semibold text-ink">{t('citizen.ai.proposal')}</p>
            <AiPanel ai={ai} />
          </div>
        )}

        <div className="flex flex-col gap-3">
          <Link
            to={PATHS.citizenTracking.replace(':id', encodeURIComponent(created.report.tracking_number))}
            className="min-h-12 rounded-xl bg-brand-600 px-4 py-3 font-bold text-surface"
          >
            {t('citizen.success.track')}
          </Link>
          <button
            type="button"
            onClick={onNew}
            className="min-h-12 rounded-xl border-2 border-brand-600 px-4 font-bold text-brand-600"
          >
            {t('citizen.success.new')}
          </button>
          <Link to={PATHS.home} className="py-2 font-semibold text-brand-600 underline">
            {t('confirmation.home')}
          </Link>
        </div>
      </div>
    </div>
  )
}

function Queued({ onNew }: { onNew: () => void }) {
  const { t } = useTranslation()
  return (
    <div className="flex min-h-dvh items-center justify-center bg-gradient-to-br from-brand-600 to-brand-900 p-4">
      <div className="w-full max-w-md rounded-3xl bg-surface p-8 text-center shadow-2xl">
        <CloudOff aria-hidden="true" className="mx-auto mb-4 size-20 text-brand-600" />
        <h1 className="mb-2 text-2xl font-bold text-ink">{t('citizen.offline.title')}</h1>
        <p className="mb-6 text-muted">{t('citizen.offline.body')}</p>
        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={onNew}
            className="min-h-12 rounded-xl bg-brand-600 px-4 font-bold text-surface"
          >
            {t('citizen.success.new')}
          </button>
          <Link to={PATHS.home} className="py-2 font-semibold text-brand-600 underline">
            {t('confirmation.home')}
          </Link>
        </div>
      </div>
    </div>
  )
}

function ReportForm() {
  const { t } = useTranslation()
  const { position, locate } = useGps()
  const [photo, setPhoto] = useState<Photo>({ state: 'none' })
  const [suggestion, setSuggestion] = useState<Suggestion>({ state: 'idle' })
  const [category, setCategory] = useState<WasteType | null>(null)
  const [comment, setComment] = useState('')
  const [voice, setVoice] = useState<Blob | null>(null)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<ErrorKey | null>(null)
  const [sent, setSent] = useState<CreatedReport | null>(null)
  const [queued, setQueued] = useState(false)
  const [clientId, setClientId] = useState(() => crypto.randomUUID())
  const outbox = useOutbox()
  const photoUrl = photo.state === 'ready' ? photo.url : undefined

  useEffect(() => {
    if (!photoUrl) return
    return () => URL.revokeObjectURL(photoUrl)
  }, [photoUrl])

  async function onPhotoChosen(file: File) {
    setPhoto({ state: 'processing' })
    setSuggestion({ state: 'idle' })
    let blob: Blob
    try {
      blob = await preparePhoto(file, browserCodec)
    } catch {
      setPhoto({ state: 'unreadable' })
      return
    }
    setPhoto({ state: 'ready', blob, url: URL.createObjectURL(blob) })
    // Proposition de l'IA avant l'envoi ; sans réseau, on s'en passe (l'humain décide).
    setSuggestion({ state: 'loading' })
    try {
      const ai = await classify(blob)
      setSuggestion({ state: 'ready', ai })
      // Préremplie seulement à 60 % ou plus, et jamais à la place d'un choix du citoyen.
      if (ai.suggested_category) setCategory((current) => current ?? ai.suggested_category)
    } catch {
      setSuggestion({ state: 'idle' })
    }
  }

  function removePhoto() {
    setPhoto({ state: 'none' })
    setSuggestion({ state: 'idle' })
  }

  const missing =
    photo.state !== 'ready'
      ? 'citizen.missing.photo'
      : position.state !== 'located'
        ? 'citizen.missing.position'
        : null

  async function submit() {
    if (missing || sending || photo.state !== 'ready' || position.state !== 'located') return
    setSending(true)
    setError(null)
    const report: NewReport = {
      clientId,
      photo: photo.blob,
      latitude: position.lat,
      longitude: position.lng,
      accuracy: position.accuracy,
      comment: comment.trim() || undefined,
      citizenCategory: category ?? undefined,
      voice,
    }
    try {
      setSent(await createReport(report))
    } catch (caught) {
      if (isNetworkError(caught)) {
        // Pas de réseau : gardé sur le téléphone, envoyé au retour du réseau.
        try {
          await outbox.keep(report)
          setQueued(true)
        } catch {
          setError('citizen.errors.network')
        }
      } else {
        setError(errorKey(errorCode(caught)))
      }
    } finally {
      setSending(false)
    }
  }

  function reset() {
    setSent(null)
    setQueued(false)
    removePhoto()
    setCategory(null)
    setComment('')
    setVoice(null)
    setClientId(crypto.randomUUID())
    locate()
  }

  if (sent) return <Success created={sent} onNew={reset} />
  if (queued) return <Queued onNew={reset} />

  return (
    <div className="min-h-dvh bg-gradient-to-br from-brand-600 to-brand-900">
      <header className="border-b border-surface/10 bg-brand-900/40 px-4 py-3">
        <div className="mx-auto flex max-w-2xl items-center justify-between text-surface">
          <Link to={PATHS.home} className="flex min-h-11 items-center gap-1 font-medium">
            <ChevronLeft aria-hidden="true" className="size-5" />
            {t('citizen.back')}
          </Link>
          {/* Sur téléphone, la place va aux liens. */}
          <span className="hidden font-bold sm:inline">TerangaCycle AI</span>
          <span className="flex items-center gap-3">
            <Link to={PATHS.citizenQr} className="flex min-h-11 items-center gap-1 text-sm font-medium">
              <QrCode aria-hidden="true" className="size-5" />
              {t('citizen.qr.link')}
            </Link>
            {getUser() ? (
              <Link to={PATHS.account} className="flex min-h-11 items-center gap-1 text-sm font-medium">
                <CircleUserRound aria-hidden="true" className="size-5" />
                {t('account.link')}
              </Link>
            ) : (
              <Link
                to={`${PATHS.login}?next=${encodeURIComponent(PATHS.citizenReport)}`}
                className="flex min-h-11 items-center gap-1 text-sm font-medium"
              >
                <CircleUserRound aria-hidden="true" className="size-5" />
                {t('account.loginForSms')}
              </Link>
            )}
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-2xl p-4 py-6">
        {(outbox.pending > 0 || outbox.sentNumbers.length > 0) && (
          <div role="status" className="mb-4 flex flex-col gap-2 rounded-2xl bg-surface p-4 shadow">
            {outbox.pending > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="flex items-center gap-2 text-ink">
                  <CloudOff aria-hidden="true" className="size-5 text-brand-600" />
                  {t('citizen.offline.pending', { count: outbox.pending })}
                </p>
                <button
                  type="button"
                  onClick={() => void outbox.sendNow()}
                  disabled={outbox.flushing}
                  className="min-h-11 rounded-xl border-2 border-brand-600 px-4 font-bold text-brand-600 disabled:opacity-50"
                >
                  {t('citizen.offline.sendNow')}
                </button>
              </div>
            )}
            {outbox.sentNumbers.length > 0 && (
              <p className="text-ink">
                {t('citizen.offline.sent', { numbers: outbox.sentNumbers.join(', ') })}
              </p>
            )}
          </div>
        )}

        <div className="overflow-hidden rounded-3xl bg-surface shadow-2xl">
          <div className="bg-gradient-to-r from-brand-900 to-brand-600 px-6 py-8 text-center text-surface">
            <Recycle aria-hidden="true" className="mx-auto mb-3 size-14 text-accent" />
            <h1 className="mb-1 text-3xl font-bold">{t('citizen.title')}</h1>
            <p className="text-mint">{t('citizen.subtitle')}</p>
          </div>

          <div className="flex flex-col gap-6 p-6">
            <Section icon={<Camera aria-hidden="true" className="size-4" />} title={t('citizen.photo.label')}>
              {photo.state === 'ready' ? (
                <div className="relative">
                  <img
                    src={photo.url}
                    alt={t('capture.preview.alt')}
                    className="h-56 w-full rounded-xl object-cover"
                  />
                  <button
                    type="button"
                    onClick={removePhoto}
                    aria-label={t('capture.preview.retake')}
                    className="absolute top-2 right-2 flex size-11 items-center justify-center rounded-full bg-ink/80 text-surface"
                  >
                    <X aria-hidden="true" className="size-5" />
                  </button>
                </div>
              ) : (
                <PhotoPicker
                  onFile={(file) => void onPhotoChosen(file)}
                  busy={photo.state === 'processing'}
                />
              )}
              {photo.state === 'unreadable' && (
                <p role="alert" className="text-sm text-ink">
                  {t('capture.photo.unreadable')}
                </p>
              )}
              <p className="text-xs text-muted">{t('capture.rule.body')}</p>
            </Section>

            {suggestion.state !== 'idle' && (
              <Section icon={<Sparkles aria-hidden="true" className="size-4" />} title={t('citizen.ai.proposal')}>
                <div role="status" className="rounded-xl border-2 border-line p-4">
                  {suggestion.state === 'loading' ? (
                    <p className="flex items-center gap-2 text-ink">
                      <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                      {t('citizen.ai.analysing')}
                    </p>
                  ) : (
                    <AiPanel ai={suggestion.ai} />
                  )}
                </div>
              </Section>
            )}

            <Section icon={<MapPin aria-hidden="true" className="size-4" />} title={t('citizen.position.label')}>
              <div
                role="status"
                className={`rounded-xl border-2 p-4 ${
                  position.state === 'located' ? 'border-brand-600 bg-mint' : 'border-line bg-surface'
                }`}
              >
                {position.state === 'locating' && (
                  <p className="flex items-center gap-2 text-ink">
                    <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                    {t('capture.position.locating')}
                  </p>
                )}
                {position.state === 'located' && (
                  <p className="flex items-center gap-2 font-bold text-brand-900">
                    <CheckCircle2 aria-hidden="true" className="size-5" />
                    {t('capture.position.detected', { accuracy: Math.ceil(position.accuracy) })}
                  </p>
                )}
                {position.state === 'error' && (
                  <div className="flex flex-col gap-3">
                    <p className="text-ink">{t(`citizen.position.${position.reason}`)}</p>
                    <button
                      type="button"
                      onClick={locate}
                      className="flex min-h-11 items-center justify-center gap-2 self-start rounded-xl border-2 border-brand-600 px-4 font-bold text-brand-600"
                    >
                      <RotateCcw aria-hidden="true" className="size-4" />
                      {t('capture.retry')}
                    </button>
                  </div>
                )}
              </div>
            </Section>

            <Section icon={<Tag aria-hidden="true" className="size-4" />} title={t('citizen.category.label')} optional>
              <p className="text-xs text-muted">{t('citizen.category.hint')}</p>
              <WasteTypePicker value={category} onChange={setCategory} />
            </Section>

            <Composer comment={comment} onComment={setComment} voice={voice} onVoice={setVoice} />

            {error && (
              <p role="alert" className="rounded-xl border-2 border-danger bg-surface p-4 text-ink">
                {t(error)}
              </p>
            )}

            {missing && <p className="text-sm text-muted">{t(missing)}</p>}
            <button
              type="button"
              onClick={() => void submit()}
              disabled={missing !== null || sending}
              className="flex min-h-14 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-brand-900 to-brand-600 text-lg font-bold text-surface disabled:cursor-not-allowed disabled:opacity-50"
            >
              {sending ? (
                <Loader2 aria-hidden="true" className="size-5 animate-spin" />
              ) : (
                <Send aria-hidden="true" className="size-5" />
              )}
              {t(sending ? 'details.sending' : 'details.send')}
            </button>
          </div>
        </div>
      </main>
    </div>
  )
}

/** Le consentement d'abord, s'il manque ou si son texte a changé. */
export function CitizenReportPage() {
  const accepted = useCurrentConsent()
  if (accepted === undefined) return null
  if (!accepted) return <Navigate to={PATHS.consent} replace />
  return <ReportForm />
}
