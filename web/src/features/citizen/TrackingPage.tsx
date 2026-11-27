import { ChevronLeft } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router'

import { trackReport } from '../../api/endpoints.ts'
import { PATHS } from '../../paths.ts'
import { ErrorMessage, Loading, StatusBadge } from '../../ui/common.tsx'
import { formatDate, useLoad } from '../../ui/load.ts'
import { WasteTypeBadge } from '../classify/WasteTypePicker.tsx'

// Suivi public d'un signalement par son numéro (GET /api/reports/track/<numéro>) : statut,
// catégorie et historique. Ni photo ni position (règle de l'API).

export function TrackingPage() {
  const { t } = useTranslation()
  const { id = '' } = useParams()
  const { load, reload } = useLoad(() => trackReport(id), [id])

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-5 px-4 py-6">
      <Link to={PATHS.citizenReport} className="flex min-h-11 items-center gap-1 font-semibold text-brand-600">
        <ChevronLeft aria-hidden="true" className="size-5" />
        {t('citizen.tracking.back')}
      </Link>
      <h1 className="text-2xl font-bold text-brand-900">{t('citizen.tracking.title')}</h1>

      {load.state === 'loading' && <Loading />}
      {load.state === 'error' &&
        (load.code === 'NOT_FOUND' ? (
          <p role="alert" className="text-ink">{t('citizen.tracking.notFound')}</p>
        ) : (
          <ErrorMessage code={load.code} onRetry={reload} />
        ))}
      {load.state === 'ready' && (
        <div className="flex flex-col gap-4 rounded-2xl border border-line p-5">
          <p className="font-mono text-xl font-bold text-brand-900">{load.data.tracking_number}</p>
          <p className="flex flex-wrap items-center gap-2 text-ink">
            {t('citizen.tracking.status')}
            <StatusBadge kind="report" status={load.data.status} label={load.data.status_label} />
          </p>
          {load.data.category && <WasteTypeBadge type={load.data.category} />}
          <ol className="flex flex-col gap-2" aria-label={t('confirmation.timeline')}>
            {load.data.history.map((step, index) => {
              const current = index === load.data.history.length - 1
              return (
                <li
                  key={`${step.status}-${step.at}`}
                  aria-current={current ? 'step' : undefined}
                  className={`flex justify-between gap-3 rounded-xl border-2 p-3 ${
                    current ? 'border-brand-600 bg-mint font-bold text-ink' : 'border-line text-ink'
                  }`}
                >
                  <span>{step.label}</span>
                  <span className="shrink-0 text-sm font-normal text-muted">{formatDate(step.at)}</span>
                </li>
              )
            })}
          </ol>
        </div>
      )}
    </main>
  )
}
