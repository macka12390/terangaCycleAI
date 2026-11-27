import { Building2, Phone, Recycle, Truck } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import type { Lot } from '../../api/types.ts'
import { formatDate } from '../../ui/load.ts'
import { WasteTypeBadge } from '../classify/WasteTypePicker.tsx'
import { displayPhone } from '../admin/accounts.ts'
import { formatFcfa, formatKg, telLink } from './lots.ts'

const STATUS_STYLE: Record<Lot['status'], string> = {
  available: 'bg-mint text-brand-900',
  reserved: 'bg-warning-bg text-warning-ink',
  handed_over: 'bg-brand-600 text-surface',
  cancelled: 'border border-line text-muted',
}

function Contact({ name, phone, role }: { name: string; phone?: string | null; role: 'collector' | 'recycler' }) {
  const { t } = useTranslation()
  const link = telLink(phone)
  const Icon = role === 'collector' ? Truck : Recycle
  return (
    <span className="flex flex-wrap items-center gap-2 text-sm text-ink">
      <Icon aria-hidden="true" className="size-4 text-brand-600" />
      {t(`lots.party.${role}`)} : {name}
      {link && (
        <a href={link} className="flex items-center gap-1 font-semibold text-brand-600 underline">
          <Phone aria-hidden="true" className="size-4" />
          {displayPhone(phone)}
        </a>
      )}
    </span>
  )
}

/** Carte d'un lot : matière, poids, prix, statut, parties ; `actions` selon l'espace. */
export function LotCard({ lot, actions }: { lot: Lot; actions?: ReactNode }) {
  const { t } = useTranslation()
  return (
    <li className="flex flex-col gap-3 rounded-2xl border-2 border-line bg-surface p-4">
      <div className="flex flex-wrap items-center gap-2">
        <WasteTypeBadge type={lot.category} />
        <span className="text-xl font-bold text-ink">{formatKg(lot.weight_kg)}</span>
        <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${STATUS_STYLE[lot.status]}`}>{lot.status_label}</span>
        {lot.payment && lot.payment.status === 'succeeded' && (
          <span className="rounded-full bg-brand-600 px-2 py-0.5 text-xs font-bold text-surface">
            {t(lot.payment.is_simulated ? 'payments.lotPaidSimulated' : 'payments.lotPaid', { amount: formatFcfa(lot.payment.amount_fcfa) })}
          </span>
        )}
        <span className="ml-auto text-sm text-muted">{formatDate(lot.created_at)}</span>
      </div>
      <p className="text-ink">
        {lot.price_per_kg !== null
          ? t('lots.price', { perKg: formatFcfa(lot.price_per_kg), total: formatFcfa(lot.total_price) })
          : t('lots.noPrice')}
      </p>
      {lot.description && <p className="text-sm text-muted">{lot.description}</p>}
      <div className="flex flex-col gap-1">
        <Contact name={lot.collector.name} phone={lot.collector.phone} role="collector" />
        {lot.recycler && <Contact name={lot.recycler.name} phone={lot.recycler.phone} role="recycler" />}
        {lot.organisation && (
          <span className="flex items-center gap-2 text-sm text-muted">
            <Building2 aria-hidden="true" className="size-4" />
            {lot.organisation.name}
          </span>
        )}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </li>
  )
}
