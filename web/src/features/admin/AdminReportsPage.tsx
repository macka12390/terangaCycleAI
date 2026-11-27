import { Check, MapPin, Pencil, X } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { listReports, moderateReport } from '../../api/endpoints.ts'
import { errorCode } from '../../api/http.ts'
import type { Report, ReportStatus } from '../../api/types.ts'
import { DemoTag, Empty, ErrorMessage, Loading, StatusBadge } from '../../ui/common.tsx'
import { formatDate, mapLink, useLoad } from '../../ui/load.ts'
import { AiPanel } from '../classify/AiPanel.tsx'
import { WasteTypeBadge, WasteTypePicker } from '../classify/WasteTypePicker.tsx'
import type { WasteType } from '../classify/wasteTypes.ts'
import { canCorrect, suggestedCategory } from './moderation.ts'

// Modération (§3.4) : file des signalements, photo, position, proposition de l'IA avec son
// libellé, commentaire. En attente : approuver (crée la mission) ou rejeter (motif
// facultatif). Ensuite, la catégorie se corrige tant que les kilos ne sont pas vérifiés.
// Le backend refuse toute transition incohérente (409 INVALID_TRANSITION).

const FILTERS: ReportStatus[] = ['pending', 'approved', 'assigned', 'collected', 'completed', 'rejected']

function ReportCard({ report, onDone }: { report: Report; onDone: () => void }) {
  const { t } = useTranslation()
  const [category, setCategory] = useState<WasteType | null>(suggestedCategory(report))
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const map = mapLink(report.latitude, report.longitude)
  const pending = report.status === 'pending'
  const correctable = canCorrect(report)

  async function run(decision: Parameters<typeof moderateReport>[1]) {
    setBusy(true)
    setFailure(null)
    try {
      await moderateReport(report.id, decision)
      onDone()
    } catch (error) {
      setFailure(errorCode(error))
      setBusy(false)
    }
  }

  return (
    <article className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-4 shadow-sm lg:flex-row">
      <img
        src={report.photo_url}
        alt={t('admin.reports.photoAlt', { number: report.tracking_number })}
        className="h-56 w-full rounded-xl object-cover lg:w-72"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono font-bold text-brand-900">{report.tracking_number}</span>
          <StatusBadge kind="report" status={report.status} label={report.status_label} />
          {report.is_demo && <DemoTag />}
          <span className="text-sm text-muted">{formatDate(report.created_at)}</span>
        </div>

        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="mb-1 text-muted">{t('admin.reports.ai')}</dt>
            <dd>{report.ai ? <AiPanel ai={report.ai} /> : t('admin.reports.manual')}</dd>
          </div>
          <div>
            <dt className="mb-1 text-muted">{t('admin.reports.citizenCategory')}</dt>
            <dd className="text-ink">
              {report.citizen_category ? <WasteTypeBadge type={report.citizen_category} /> : '—'}
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-muted">{t('admin.reports.comment')}</dt>
            <dd className="text-ink">{report.comment ?? '—'}</dd>
          </div>
          {report.final_category && (
            <div>
              <dt className="text-muted">{t('admin.reports.finalCategory')}</dt>
              <dd><WasteTypeBadge type={report.final_category} /></dd>
            </div>
          )}
          {report.rejection_reason && (
            <div>
              <dt className="text-muted">{t('admin.reports.reason')}</dt>
              <dd className="text-ink">{report.rejection_reason}</dd>
            </div>
          )}
        </dl>

        {map && (
          <a href={map} target="_blank" rel="noreferrer" className="flex items-center gap-1 self-start text-sm font-semibold text-brand-600 underline">
            <MapPin aria-hidden="true" className="size-4" />
            {t('admin.reports.map')}
          </a>
        )}

        {(pending || correctable) && (
          <div className="flex flex-col gap-3 border-t border-line pt-3">
            <WasteTypePicker value={category} onChange={setCategory} />
            {pending && rejecting && (
              <label className="flex flex-col gap-1 text-sm font-semibold text-ink">
                <span>
                  {t('admin.reports.reasonLabel')}{' '}
                  <span className="font-normal text-muted">{t('details.optional')}</span>
                </span>
                <input
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  maxLength={500}
                  className="min-h-11 rounded-xl border-2 border-line px-3 font-normal"
                  placeholder={t('admin.reports.reasonPlaceholder')}
                />
              </label>
            )}
            {failure && <ErrorMessage code={failure} />}
            <div className="flex flex-wrap gap-2">
              {pending && (
                <>
                  <button
                    type="button"
                    disabled={busy || category === null}
                    onClick={() => void run({ action: 'approve', final_category: category ?? undefined })}
                    className="flex min-h-11 items-center gap-2 rounded-xl bg-brand-600 px-4 font-bold text-surface disabled:opacity-50"
                  >
                    <Check aria-hidden="true" className="size-5" />
                    {t('admin.reports.validate')}
                  </button>
                  {rejecting ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void run({ action: 'reject', reason: reason.trim() || undefined })}
                      className="flex min-h-11 items-center gap-2 rounded-xl bg-ink px-4 font-bold text-surface disabled:opacity-50"
                    >
                      <X aria-hidden="true" className="size-5" />
                      {t('admin.reports.confirmReject')}
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setRejecting(true)}
                      className="flex min-h-11 items-center gap-2 rounded-xl border-2 border-ink px-4 font-bold text-ink"
                    >
                      <X aria-hidden="true" className="size-5" />
                      {t('admin.reports.reject')}
                    </button>
                  )}
                </>
              )}
              {correctable && (
                <button
                  type="button"
                  disabled={busy || category === null || category === report.final_category}
                  onClick={() => category && void run({ action: 'correct', final_category: category })}
                  className="flex min-h-11 items-center gap-2 rounded-xl border-2 border-brand-600 px-4 font-bold text-brand-600 disabled:opacity-50"
                >
                  <Pencil aria-hidden="true" className="size-5" />
                  {t('admin.reports.correct')}
                </button>
              )}
            </div>
            {pending && category === null && (
              <p className="text-sm text-muted">{t('admin.reports.needCategory')}</p>
            )}
          </div>
        )}
      </div>
    </article>
  )
}

export function AdminReportsPage() {
  const { t } = useTranslation()
  const [filter, setFilter] = useState<ReportStatus>('pending')
  const { load, reload } = useLoad(() => listReports(filter), [filter])

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-2xl font-bold text-brand-900">{t('admin.reports.title')}</h1>
      <div role="tablist" className="flex flex-wrap gap-2">
        {FILTERS.map((status) => (
          <button
            key={status}
            type="button"
            role="tab"
            aria-selected={filter === status}
            onClick={() => setFilter(status)}
            className={`min-h-11 rounded-full px-4 font-semibold ${
              filter === status ? 'bg-brand-600 text-surface' : 'border-2 border-line text-ink'
            }`}
          >
            {t(`statuses.report.${status}`)}
          </button>
        ))}
      </div>
      {load.state === 'loading' && <Loading />}
      {load.state === 'error' && <ErrorMessage code={load.code} onRetry={reload} />}
      {load.state === 'ready' &&
        (load.data.length === 0 ? (
          <Empty>{t('admin.reports.empty')}</Empty>
        ) : (
          <div className="flex flex-col gap-4">
            {load.data.map((report) => (
              <ReportCard key={`${report.id}-${report.updated_at}`} report={report} onDone={reload} />
            ))}
          </div>
        ))}
    </div>
  )
}
