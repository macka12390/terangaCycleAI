import { Check, CircleHelp, X } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { listProofs, verifyProof } from '../../api/endpoints.ts'
import { errorCode } from '../../api/http.ts'
import type { Proof, ProofStatus } from '../../api/types.ts'
import { DemoTag, Empty, ErrorMessage, Loading, StatusBadge } from '../../ui/common.tsx'
import { formatDate, useLoad } from '../../ui/load.ts'
import { WasteTypeBadge } from '../classify/WasteTypePicker.tsx'

// Vérification des preuves de collecte (§3.6) : photos avant et après, poids déclaré.
// Vérifiée : les kilos sont comptés. Rejetée : le collecteur renvoie une preuve. Contestée :
// en attente d'arbitrage, non comptée, puis vérifiée ou rejetée.

const FILTERS: ProofStatus[] = ['pending', 'disputed', 'verified', 'rejected']

function ProofCard({ proof, onDone }: { proof: Proof; onDone: () => void }) {
  const { t } = useTranslation()
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const open = proof.status === 'pending' || proof.status === 'disputed'

  async function decide(decision: 'verified' | 'rejected' | 'disputed') {
    setBusy(true)
    setFailure(null)
    try {
      await verifyProof(proof.id, decision, note.trim() || undefined)
      onDone()
    } catch (error) {
      setFailure(errorCode(error))
      setBusy(false)
    }
  }

  return (
    <article className="flex flex-col gap-4 rounded-3xl border border-line bg-white p-5 shadow-card transition hover:shadow-lift lg:flex-row">
      <div className="grid grid-cols-2 gap-2 lg:w-80 lg:shrink-0">
        <figure className="flex flex-col gap-1">
          <img src={proof.report.photo_before_url} alt={t('admin.proofs.before')} className="h-36 w-full rounded-xl object-cover" />
          <figcaption className="text-xs text-muted">{t('admin.proofs.before')}</figcaption>
        </figure>
        <figure className="flex flex-col gap-1">
          <img src={proof.photo_after_url} alt={t('admin.proofs.after')} className="h-36 w-full rounded-xl object-cover" />
          <figcaption className="text-xs text-muted">{t('admin.proofs.after')}</figcaption>
        </figure>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono font-bold text-ink">{proof.report.tracking_number}</span>
          <StatusBadge kind="proof" status={proof.status} label={proof.status_label} />
          {proof.is_demo && <DemoTag />}
          <span className="text-sm text-muted">{formatDate(proof.created_at)}</span>
        </div>
        <p className="text-3xl font-bold text-brand-900">{proof.weight_kg.toLocaleString('fr-FR')} kg</p>
        <div className="flex flex-wrap items-center gap-3 text-sm text-ink">
          {proof.report.waste_type && <WasteTypeBadge type={proof.report.waste_type} />}
          {proof.collector && <span>{t('admin.proofs.collector', { name: proof.collector.name })}</span>}
        </div>
        {proof.comment && <p className="text-sm text-ink">{proof.comment}</p>}
        {proof.review_note && (
          <p className="text-sm text-muted">{t('admin.proofs.reviewNote', { note: proof.review_note })}</p>
        )}
        {failure && <ErrorMessage code={failure} />}
        {open && (
          <>
            <label className="flex flex-col gap-1 text-sm font-semibold text-ink">
              <span>
                {t('admin.proofs.note')} <span className="font-normal text-muted">{t('details.optional')}</span>
              </span>
              <input
                value={note}
                onChange={(event) => setNote(event.target.value)}
                maxLength={500}
                className="min-h-11 rounded-xl border-2 border-line px-3 font-normal"
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={busy} onClick={() => void decide('verified')} className="flex min-h-11 items-center gap-2 rounded-xl bg-brand-600 px-4 font-bold text-surface disabled:opacity-50">
                <Check aria-hidden="true" className="size-5" />
                {t('admin.proofs.verify')}
              </button>
              {proof.status === 'pending' && (
                <button type="button" disabled={busy} onClick={() => void decide('disputed')} className="flex min-h-11 items-center gap-2 rounded-xl border-2 border-warning-ink px-4 font-bold text-warning-ink disabled:opacity-50">
                  <CircleHelp aria-hidden="true" className="size-5" />
                  {t('admin.proofs.contest')}
                </button>
              )}
              <button type="button" disabled={busy} onClick={() => void decide('rejected')} className="flex min-h-11 items-center gap-2 rounded-xl border-2 border-ink px-4 font-bold text-ink disabled:opacity-50">
                <X aria-hidden="true" className="size-5" />
                {t('admin.proofs.reject')}
              </button>
            </div>
          </>
        )}
      </div>
    </article>
  )
}

export function AdminProofsPage() {
  const { t } = useTranslation()
  const [filter, setFilter] = useState<ProofStatus>('pending')
  const { load, reload } = useLoad(() => listProofs(filter), [filter])

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-3xl font-extrabold tracking-tight text-brand-900">{t('admin.proofs.title')}</h1>
      <p className="text-sm text-muted">{t('admin.proofs.rule')}</p>
      <div role="tablist" className="flex flex-wrap gap-2">
        {FILTERS.map((status) => (
          <button
            key={status}
            type="button"
            role="tab"
            aria-selected={filter === status}
            onClick={() => setFilter(status)}
            className={`min-h-11 rounded-full px-4 font-semibold ${filter === status ? 'bg-brand-600 text-white shadow-card' : 'border border-line bg-white text-ink hover:border-brand-600'}`}
          >
            {t(`statuses.proof.${status}`)}
          </button>
        ))}
      </div>
      {load.state === 'loading' && <Loading />}
      {load.state === 'error' && <ErrorMessage code={load.code} onRetry={reload} />}
      {load.state === 'ready' &&
        (load.data.length === 0 ? (
          <Empty>{t('admin.proofs.empty')}</Empty>
        ) : (
          <div className="flex flex-col gap-4">
            {load.data.map((proof) => (
              <ProofCard key={`${proof.id}-${proof.status}`} proof={proof} onDone={reload} />
            ))}
          </div>
        ))}
    </div>
  )
}
