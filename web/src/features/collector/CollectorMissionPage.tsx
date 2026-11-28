import { CheckCircle2, ChevronLeft, X } from 'lucide-react'
import { Suspense, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router'

import { getMission, sendProof } from '../../api/endpoints.ts'
import { errorCode } from '../../api/http.ts'
import type { Mission } from '../../api/types.ts'
import { PATHS } from '../../paths.ts'
import { ErrorMessage, Loading, StatusBadge } from '../../ui/common.tsx'
import { formatDate, useLoad } from '../../ui/load.ts'
import { PhotoPicker } from '../../ui/PhotoPicker.tsx'
import { WasteTypeBadge } from '../classify/WasteTypePicker.tsx'
import { browserCodec, preparePhoto } from '../report/photo.ts'
import { getUser } from '../session/session.ts'
import { CollectorMap } from './lazyMap.tsx'
import { parseWeight } from './missions.ts'

// Détail d'une mission et preuve de collecte (§3.6) : photo après collecte (appareil photo
// ou galerie, allégée et sans métadonnées), poids réellement récupéré (> 0 et ≤ 10 000 kg),
// commentaire. La mission passe à « terminée » ; les kilos ne comptent qu'après
// vérification. Une preuve rejetée remet la mission « acceptée » : on en renvoie une.

function ProofForm({ mission, onSent }: { mission: Mission; onSent: () => void }) {
  const { t } = useTranslation()
  const [photo, setPhoto] = useState<{ blob: Blob; url: string } | null>(null)
  const [processing, setProcessing] = useState(false)
  const [weight, setWeight] = useState('')
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const parsed = parseWeight(weight)
  const photoUrl = photo?.url

  useEffect(() => {
    if (!photoUrl) return
    return () => URL.revokeObjectURL(photoUrl)
  }, [photoUrl])

  async function onPhoto(file: File) {
    setProcessing(true)
    setFailure(null)
    try {
      const blob = await preparePhoto(file, browserCodec)
      setPhoto({ blob, url: URL.createObjectURL(blob) })
    } catch {
      setFailure('UNSUPPORTED_FILE')
    } finally {
      setProcessing(false)
    }
  }

  async function submit() {
    if (!photo || parsed === null) return
    setBusy(true)
    setFailure(null)
    try {
      await sendProof(mission.id, { photo: photo.blob, weightKg: parsed, comment: comment.trim() || undefined })
      onSent()
    } catch (error) {
      setFailure(errorCode(error))
      setBusy(false)
    }
  }

  return (
    <section aria-labelledby="proof" className="flex flex-col gap-4 rounded-2xl border border-line p-4">
      <h2 id="proof" className="text-lg font-bold text-brand-900">{t('collector.proof.title')}</h2>
      {mission.proof?.status === 'rejected' && (
        <p role="alert" className="rounded-xl bg-warning-bg p-3 text-warning-ink">
          {t('collector.proof.rejected', { note: mission.proof.review_note ?? '—' })}
        </p>
      )}
      {photo ? (
        <div className="relative">
          <img src={photo.url} alt={t('collector.proof.afterAlt')} className="h-48 w-full rounded-xl object-cover" />
          <button type="button" onClick={() => setPhoto(null)} aria-label={t('capture.preview.retake')} className="absolute top-2 right-2 flex size-11 items-center justify-center rounded-full bg-ink/80 text-surface">
            <X aria-hidden="true" className="size-5" />
          </button>
        </div>
      ) : (
        <PhotoPicker onFile={(file) => void onPhoto(file)} busy={processing} cameraLabel={t('collector.proof.photo')} />
      )}
      <label className="flex flex-col gap-1 font-semibold text-ink">
        {t('collector.proof.weight')}
        <input
          inputMode="decimal"
          value={weight}
          onChange={(event) => setWeight(event.target.value)}
          placeholder="42,5"
          aria-invalid={weight !== '' && parsed === null}
          className="min-h-12 rounded-xl border-2 border-line px-3 text-lg font-normal"
        />
      </label>
      {weight !== '' && parsed === null && <p className="text-sm text-ink">{t('collector.proof.weightInvalid')}</p>}
      <label className="flex flex-col gap-1 font-semibold text-ink">
        <span>
          {t('collector.proof.comment')} <span className="font-normal text-muted">{t('details.optional')}</span>
        </span>
        <textarea value={comment} onChange={(event) => setComment(event.target.value)} rows={2} maxLength={500} className="rounded-xl border-2 border-line px-3 py-2 font-normal" />
      </label>
      {failure && <ErrorMessage code={failure} />}
      <button type="button" disabled={!photo || parsed === null || busy} onClick={() => void submit()} className="min-h-12 rounded-xl bg-brand-600 text-lg font-bold text-surface disabled:opacity-50">
        {t(busy ? 'details.sending' : 'collector.proof.send')}
      </button>
    </section>
  )
}

export function CollectorMissionPage() {
  const { t } = useTranslation()
  const id = Number(useParams().id)
  const { load, reload } = useLoad(() => getMission(id), [id])
  const user = getUser()

  return (
    <div className="flex flex-col gap-4">
      <Link to={PATHS.collector} className="flex min-h-11 items-center gap-1 font-semibold text-brand-600">
        <ChevronLeft aria-hidden="true" className="size-5" />
        {t('collector.back')}
      </Link>
      {load.state === 'loading' && <Loading />}
      {load.state === 'error' && <ErrorMessage code={load.code} onRetry={reload} />}
      {load.state === 'ready' && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold text-brand-900">{t('collector.mission', { id: load.data.tracking_number })}</h1>
            <StatusBadge kind="mission" status={load.data.status} label={load.data.status_label} />
          </div>
          <img src={load.data.photo_before_url} alt={t('collector.photoAlt', { id: load.data.tracking_number })} className="h-56 w-full rounded-2xl object-cover" />
          <div className="flex flex-wrap items-center gap-3">
            {load.data.waste_type && <WasteTypeBadge type={load.data.waste_type} />}
            <span className="text-sm text-muted">{t('collector.created', { date: formatDate(load.data.created_at) })}</span>
          </div>
          {load.data.report_comment && <p className="text-ink">{load.data.report_comment}</p>}
          {load.data.latitude !== null &&
            load.data.longitude !== null &&
            load.data.status !== 'completed' && (
              <Suspense fallback={<Loading />}>
                <CollectorMap lat={load.data.latitude} lng={load.data.longitude} />
              </Suspense>
            )}
          {load.data.status === 'completed' ? (
            <p role="status" className="flex items-center gap-2 rounded-xl bg-mint p-4 font-bold text-brand-900">
              <CheckCircle2 aria-hidden="true" className="size-6" />
              {load.data.proof?.status === 'verified' ? t('collector.proof.verified') : t('collector.proof.sent')}
            </p>
          ) : load.data.status === 'accepted' && load.data.collector?.id === user?.id ? (
            <ProofForm mission={load.data} onSent={reload} />
          ) : null}
        </>
      )}
    </div>
  )
}
