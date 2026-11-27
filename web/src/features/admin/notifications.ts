// Journal des SMS : affichage des statuts et des raisons d'un SMS non envoyé.
import type { NotificationEntry, NotificationStatus } from '../../api/types.ts'

export const STATUS_STYLE: Record<NotificationStatus, string> = {
  sent: 'bg-mint text-brand-900',
  pending: 'bg-warning-bg text-warning-ink',
  failed: 'bg-ink text-surface',
  skipped: 'border border-line text-muted',
}

export type SkipReason = 'no_phone' | 'opted_out' | 'error'

/** Pourquoi ce SMS n'est pas parti (null s'il est parti ou en attente). */
export function skipReason(entry: Pick<NotificationEntry, 'status' | 'detail'>): SkipReason | null {
  if (entry.status === 'skipped') {
    return entry.detail === 'opted_out' ? 'opted_out' : 'no_phone'
  }
  if (entry.status === 'failed') return 'error'
  return null
}
