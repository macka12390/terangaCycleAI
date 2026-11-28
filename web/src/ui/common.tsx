import { AlertTriangle, Inbox, Loader2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

// Composants partagés des espaces admin et collecteur : en-tête de page, carte, chargement,
// erreur, liste vide, badge de statut, carte statistique. Le chargement de données est
// dans `load.ts`.

/** En-tête de page : titre, sous-titre facultatif et actions à droite. */
export function PageHeader({
  title,
  subtitle,
  children,
}: {
  title: ReactNode
  subtitle?: ReactNode
  children?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="flex flex-col gap-1">
        <h1 className="flex flex-wrap items-center gap-3 text-3xl font-extrabold tracking-tight text-brand-900">
          {title}
        </h1>
        {subtitle && <p className="text-muted">{subtitle}</p>}
      </div>
      {children}
    </div>
  )
}

/** Carte blanche à coins arrondis et ombre douce. */
export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-3xl border border-line bg-white p-5 shadow-card ${className}`}>
      {children}
    </div>
  )
}

export function Loading() {
  const { t } = useTranslation()
  return (
    <p role="status" className="flex items-center justify-center gap-3 py-12 font-semibold text-muted">
      <Loader2 aria-hidden="true" className="size-6 animate-spin text-brand-600" />
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
    <div role="alert" className="flex flex-col gap-3 rounded-2xl border border-danger/40 border-l-4 border-l-danger bg-white p-4 shadow-card">
      <p className="flex items-start gap-3 text-ink">
        <AlertTriangle aria-hidden="true" className="mt-0.5 size-5 shrink-0 stroke-danger" />
        {text}
      </p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="min-h-11 self-start rounded-xl border-2 border-brand-600 px-4 font-bold text-brand-600 transition hover:bg-mint"
        >
          {t('capture.retry')}
        </button>
      )}
    </div>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="flex flex-col items-center gap-3 rounded-3xl border-2 border-dashed border-line bg-white/60 p-10 text-center text-muted">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-mint text-brand-600">
        <Inbox aria-hidden="true" className="size-7" />
      </span>
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
  verified: 'bg-brand-600 text-white',
  completed: 'bg-brand-600 text-white',
  rejected: 'bg-ink text-white',
  cancelled: 'bg-ink text-white',
}

/** Badge de statut : pastille, couleur et libellé, jamais la couleur seule. Le libellé de
 *  l'API (`status_label`) est préféré quand il est fourni. */
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
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${BADGE[status] ?? 'bg-mint text-ink'}`}>
      <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
      {label ?? t(`statuses.${kind}.${status}` as 'statuses.report.pending')}
    </span>
  )
}

export function StatCard({
  label,
  value,
  icon,
  tone = 'light',
}: {
  label: string
  value: ReactNode
  icon: ReactNode
  /** `strong` : carte mise en avant (dégradé vert), pour l'indicateur principal. */
  tone?: 'light' | 'strong'
}) {
  if (tone === 'strong') {
    return (
      <div className="relative flex items-center gap-4 overflow-hidden rounded-3xl bg-gradient-to-br from-brand-900 to-brand-600 p-5 text-white shadow-lift">
        <div aria-hidden="true" className="absolute inset-0 bg-dots" />
        <span className="relative flex size-12 shrink-0 items-center justify-center rounded-2xl bg-accent text-ink">
          {icon}
        </span>
        <div className="relative min-w-0">
          <p className="text-sm font-semibold text-mint">{label}</p>
          <p className="text-3xl font-extrabold tracking-tight">{value}</p>
        </div>
      </div>
    )
  }
  return (
    <div className="flex items-center gap-4 rounded-3xl border border-line bg-white p-5 shadow-card transition hover:-translate-y-0.5">
      <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-mint text-brand-600">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-sm text-muted">{label}</p>
        <p className="text-2xl font-extrabold tracking-tight text-ink">{value}</p>
      </div>
    </div>
  )
}

export function DemoTag() {
  const { t } = useTranslation()
  return (
    <span className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-bold text-ink">
      {t('demo.label')}
    </span>
  )
}
