import { Clock, Wallet } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { listPayments } from '../../api/endpoints.ts'
import { Empty, ErrorMessage, Loading, StatCard } from '../../ui/common.tsx'
import { useLoad } from '../../ui/load.ts'
import { formatFcfa } from '../lots/lots.ts'
import { PaymentRow, SimulatedBanner } from './PaymentRow.tsx'

// Mes gains (collecteur, étape 6) : rémunérations des collectes vérifiées et paiements
// des lots vendus aux recycleurs.

export function CollectorEarningsPage() {
  const { t } = useTranslation()
  const { load, reload } = useLoad(() => listPayments())

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold text-brand-900">{t('payments.collector.title')}</h1>
      <p className="text-muted">{t('payments.collector.intro')}</p>
      {load.state === 'loading' && <Loading />}
      {load.state === 'error' && <ErrorMessage code={load.code} onRetry={reload} />}
      {load.state === 'ready' && (
        <>
          <SimulatedBanner simulated={load.data.provider.simulated} />
          <div className="grid gap-3 sm:grid-cols-2">
            <StatCard
              label={t('payments.collector.received')}
              value={formatFcfa(load.data.summary.rewards_paid_fcfa + load.data.summary.lot_payments_fcfa)}
              icon={<Wallet aria-hidden="true" />}
            />
            <StatCard
              label={t('payments.collector.due')}
              value={formatFcfa(load.data.summary.rewards_due_fcfa)}
              icon={<Clock aria-hidden="true" />}
            />
          </div>
          {load.data.payments.length === 0 ? (
            <Empty>{t('payments.collector.empty')}</Empty>
          ) : (
            <ul className="flex flex-col gap-3">
              {load.data.payments.map((payment) => (
                <PaymentRow key={payment.id} payment={payment} />
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}
