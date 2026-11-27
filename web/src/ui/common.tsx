import { AlertTriangle, Inbox, Loader2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

// Composants partagés des espaces admin et collecteur : chargement, erreur, liste vide,
// badge de statut, carte statistique. Le chargement de données est dans `load.ts`.

export function Loading() {
  const { t } = useTranslation()
  return (
    <p role="status" className="flex items-center gap-2 py-8 text-ink">
      <Loader2 aria-hidden="true" className="size-5 animate-spin" />
      {t('common.loading')}
    </p>
  )
}

/** Message d'erreur de l'API : traduit par `apiErrors.<code>`, sinon message générique. */
export function ErrorMessage({ code, onRetry }: { code: string; onRetry?: () => void }) {
  const { t, i18n } = useTranslation()
  const key = `apiErrors.${code}`
  const text = i18n.exists(key) ? t(key as 'apiErrors.network') : t('apiErrors.generic')
  return (
    <div role="alert" className="flex flex-col gap-3 rounded-xl border-2 border-danger bg-surface p-4">
      <p className="flex items-start gap-2 text-ink">
        <AlertTriangle aria-hidden="true" className="mt-0.5 size-5 shrink-0 stroke-danger" />
        {text}
      </p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="min-h-11 self-start rounded-xl border-2 border-brand-600 px-4 font-bold text-brand-600"
        >
          {t('capture.retry')}
        </button>
      )}
    </div>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="flex flex-col items-center gap-2 rounded-xl border-2 border-dashed border-line p-8 text-center text-muted">
      <Inbox aria-hidden="true" className="size-8" />
      {children}
    </p>
  )
}

const BADGE: Record<string, string> = {
  pending: 'bg-warning-bg text-warning-ink',
  available: 'bg-warning-bg text-warning-ink',
  disputed: 'bg-warning-bg text-warning-ink',
  approved: 'bg-mint text-brand-900',
  accepted: 'bg-mint text-brand-900',
  assigned: 'bg-mint text-brand-900',
  collected: 'bg-mint text-brand-900',
  verified: 'bg-brand-600 text-surface',
  completed: 'bg-brand-600 text-surface',
  rejected: 'bg-ink text-surface',
  cancelled: 'bg-ink text-surface',
}

/** Badge de statut : couleur et libellé, jamais la couleur seule. Le libellé de l'API
 *  (`status_label`) est préféré quand il est fourni. */
export function StatusBadge({
  kind,
  status,
  label,
}: {
  kind: 'report' | 'mission' | 'proof'
  status: string
  label?: string
}) {
  const { t } = useTranslation()
  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${BADGE[status] ?? 'bg-mint text-ink'}`}>
      {label ?? t(`statuses.${kind}.${status}` as 'statuses.report.pending')}
    </span>
  )
}

export function StatCard({ label, value, icon }: { label: string; value: ReactNode; icon: ReactNode }) {
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-line bg-surface p-4 shadow-sm">
      <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-mint text-brand-600">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-sm text-muted">{label}</p>
        <p className="text-2xl font-bold text-ink">{value}</p>
      </div>
    </div>
  )
}

export function DemoTag() {
  const { t } = useTranslation()
  return (
    <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-bold text-ink">
      {t('demo.label')}
    </span>
  )
}
