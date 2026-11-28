import { Banknote } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import type { PaymentEntry } from '../../api/types.ts'
import { formatDate } from '../../ui/load.ts'
import { formatFcfa, formatKg } from '../lots/lots.ts'
import { STATUS_STYLE } from './payments.ts'

/** Ligne de paiement : montant, statut, motif, parties ; `action` selon l'espace. */
export function PaymentRow({ payment, action }: { payment: PaymentEntry; action?: ReactNode }) {
  const { t } = useTranslation()
  return (
    <li className="flex flex-col gap-2 rounded-3xl border border-line bg-white p-5 shadow-card">
      <div className="flex flex-wrap items-center gap-2">
        <Banknote aria-hidden="true" className="size-5 text-brand-600" />
        <span className="text-lg font-bold text-ink">{formatFcfa(payment.amount_fcfa)}</span>
        <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${STATUS_STYLE[payment.status]}`}>
          {payment.status_label}
        </span>
        {payment.is_simulated && (
          <span className="rounded-full border border-warning-ink px-2 py-0.5 text-xs font-bold text-warning-ink">
            {t('payments.simulatedTag')}
          </span>
        )}
        <span className="ml-auto text-sm text-muted">{formatDate(payment.completed_at ?? payment.created_at)}</span>
      </div>
      <p className="text-sm text-ink">
        {t(`payments.reason.${payment.kind}`, {
          kg: formatKg(payment.weight_kg),
          category: payment.category_label.toLowerCase(),
          price: formatFcfa(payment.price_per_kg),
        })}
        {payment.tracking_number && <span className="font-mono text-muted"> · {payment.tracking_number}</span>}
      </p>
      <p className="text-sm text-muted">
        {t('payments.parties', {
          payee: payment.payee?.name ?? '—',
          payer: payment.payer?.name ?? payment.organisation?.name ?? '—',
        })}
        {payment.provider_ref && <span className="font-mono"> · {payment.provider_ref}</span>}
      </p>
      {payment.failure_reason && (
        <p role="alert" className="text-sm font-semibold text-warning-ink">
          {t('payments.failed', { reason: payment.failure_reason })}
        </p>
      )}
      {action && <div className="flex flex-wrap gap-2">{action}</div>}
    </li>
  )
}

/** Bandeau : tant que le fournisseur est simulé, aucun argent ne bouge. */
export function SimulatedBanner({ simulated }: { simulated: boolean }) {
  const { t } = useTranslation()
  if (!simulated) return null
  return (
    <p className="rounded-2xl border-l-4 border-warning-ink bg-warning-bg p-4 font-semibold text-ink">
      {t('payments.simulatedBanner')}
    </p>
  )
}
