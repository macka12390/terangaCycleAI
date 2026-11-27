// Paiements (étape 6) : règles d'affichage partagées. Le backend applique les vraies règles
// (une rémunération par preuve, un paiement par lot, pas de double versement).
import type { Lot, PaymentEntry, PaymentStatus } from '../../api/types.ts'

export const STATUS_STYLE: Record<PaymentStatus, string> = {
  pending: 'bg-warning-bg text-warning-ink',
  processing: 'bg-warning-bg text-warning-ink',
  succeeded: 'bg-mint text-brand-900',
  failed: 'bg-ink text-surface',
}

/** Rémunération à verser (ou à relancer après un échec). */
export function isDue(payment: Pick<PaymentEntry, 'kind' | 'status'>): boolean {
  return payment.kind === 'collector_reward' && (payment.status === 'pending' || payment.status === 'failed')
}

/** Total en francs CFA des paiements donnés. */
export function sumFcfa(payments: Pick<PaymentEntry, 'amount_fcfa'>[]): number {
  return payments.reduce((total, payment) => total + payment.amount_fcfa, 0)
}

/** Le recycleur connecté peut-il payer ce lot dans l'application ? */
export function canPayLot(lot: Lot, userId: number | undefined): boolean {
  if (userId === undefined || lot.recycler?.id !== userId) return false
  if (lot.status !== 'reserved' && lot.status !== 'handed_over') return false
  if (lot.price_per_kg === null || lot.price_per_kg <= 0) return false
  return lot.payment === null || lot.payment === undefined || lot.payment.status === 'failed'
}
