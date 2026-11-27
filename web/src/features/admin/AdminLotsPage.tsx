import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { listLots } from '../../api/endpoints.ts'
import type { LotStatus } from '../../api/types.ts'
import { Empty, ErrorMessage, Loading } from '../../ui/common.tsx'
import { useLoad } from '../../ui/load.ts'
import { LotCard } from '../lots/LotCard.tsx'

// Lots de matière (étape 5) côté admin : ce que les collecteurs de l'organisation vendent
// aux recycleurs, et ce qui a été remis. Lecture seule.

const FILTERS: (LotStatus | '')[] = ['', 'available', 'reserved', 'handed_over', 'cancelled']

export function AdminLotsPage() {
  const { t } = useTranslation()
  const [status, setStatus] = useState<LotStatus | ''>('')
  const { load, reload } = useLoad(() => listLots({ status: status || undefined }), [status])

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-2xl font-bold text-brand-900">{t('lots.admin.title')}</h1>
      <p className="text-muted">{t('lots.admin.intro')}</p>
      <div role="tablist" className="flex flex-wrap gap-2">
        {FILTERS.map((value) => (
          <button
            key={value || 'all'}
            type="button"
            role="tab"
            aria-selected={status === value}
            onClick={() => setStatus(value)}
            className={`min-h-11 rounded-full px-4 font-semibold ${
              status === value ? 'bg-brand-600 text-surface' : 'border-2 border-line text-ink'
            }`}
          >
            {t(`lots.statuses.${value || 'all'}`)}
          </button>
        ))}
      </div>
      {load.state === 'loading' && <Loading />}
      {load.state === 'error' && <ErrorMessage code={load.code} onRetry={reload} />}
      {load.state === 'ready' &&
        (load.data.length === 0 ? (
          <Empty>{t('lots.admin.empty')}</Empty>
        ) : (
          <ul className="grid gap-3 lg:grid-cols-2">
            {load.data.map((lot) => (
              <LotCard key={lot.id} lot={lot} />
            ))}
          </ul>
        ))}
    </div>
  )
}
