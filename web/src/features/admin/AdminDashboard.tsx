import {
  Banknote,
  BrainCircuit,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Factory,
  FileWarning,
  Inbox,
  Scale,
  ShieldCheck,
  Truck,
} from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { dashboardStats, listOrganisations } from '../../api/endpoints.ts'
import type { Activity, Category } from '../../api/types.ts'
import { DemoTag, Empty, ErrorMessage, Loading, StatCard } from '../../ui/common.tsx'
import { formatDate, useLoad } from '../../ui/load.ts'
import { getUser } from '../session/session.ts'

// Tableau de bord d'impact (§3.7) : tout vient de GET /api/dashboard/stats, calculé par
// l'API depuis la base. Les kilos ne comptent que les preuves vérifiées.

/** Couleurs des catégories : les jetons --color-waste-* de theme.css. */
const COLORS: Record<Category, string> = {
  plastic: 'var(--color-waste-plastic)',
  metal: 'var(--color-waste-metal)',
  paper: 'var(--color-waste-paper)',
  glass: 'var(--color-waste-glass)',
  organic: 'var(--color-waste-organic)',
}

const kg = (value: number) => `${value.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} kg`

function ActivityLine({ item }: { item: Activity }) {
  const { t } = useTranslation()
  return (
    <li className="flex flex-wrap justify-between gap-2 py-2 text-sm">
      <span className="text-ink">
        {t('admin.dashboard.activityLine', {
          entity: t(`admin.dashboard.entities.${item.entity}` as 'admin.dashboard.entities.report'),
          number: item.tracking_number ?? `#${item.entity_id}`,
          status: item.to_status_label ?? item.to_status,
        })}
        {item.actor && <span className="text-muted"> · {item.actor}</span>}
      </span>
      <span className="shrink-0 text-muted">{formatDate(item.at)}</span>
    </li>
  )
}

export function AdminDashboard() {
  const { t } = useTranslation()
  const isSuperadmin = getUser()?.role === 'superadmin'
  const [organisationId, setOrganisationId] = useState<number | undefined>(undefined)
  const { load, reload } = useLoad(() => dashboardStats(organisationId), [organisationId])
  const organisations = useLoad(
    () => (isSuperadmin ? listOrganisations() : Promise.resolve(null)),
    [isSuperadmin],
  ).load

  const picker = isSuperadmin && organisations.state === 'ready' && organisations.data && (
    <label className="flex items-center gap-2 text-sm font-semibold text-ink">
      {t('admin.dashboard.organisation')}
      <select
        value={organisationId ?? ''}
        onChange={(event) => setOrganisationId(event.target.value ? Number(event.target.value) : undefined)}
        className="min-h-11 rounded-xl border-2 border-line bg-surface px-3"
      >
        <option value="">{t('admin.dashboard.allOrganisations')}</option>
        {organisations.data.organisations.map((organisation) => (
          <option key={organisation.id} value={organisation.id}>
            {organisation.name}
          </option>
        ))}
      </select>
    </label>
  )

  if (load.state === 'loading') return <Loading />
  if (load.state === 'error') return <ErrorMessage code={load.code} onRetry={reload} />
  const stats = load.data
  const byCategory = stats.kg_by_category.filter((row) => row.kg > 0)
  const agreement = stats.ai.agreement_rate

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold text-brand-900">{t('admin.dashboard.title')}</h1>
        {stats.demo.included && stats.demo.demo_reports > 0 && <DemoTag />}
        <span className="ml-auto">{picker}</span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={t('admin.dashboard.verifiedKg')} value={kg(stats.verified_kg)} icon={<Scale aria-hidden="true" />} />
        <StatCard label={t('admin.dashboard.reportsTotal')} value={stats.reports.total} icon={<Inbox aria-hidden="true" />} />
        <StatCard label={t('admin.dashboard.reportsPending')} value={stats.reports.pending} icon={<Clock aria-hidden="true" />} />
        <StatCard label={t('admin.dashboard.reportsValidated')} value={stats.reports.validated} icon={<ShieldCheck aria-hidden="true" />} />
        <StatCard label={t('admin.dashboard.missionsAvailable')} value={stats.missions.available} icon={<Truck aria-hidden="true" />} />
        <StatCard label={t('admin.dashboard.collectionsCompleted')} value={stats.collections.completed} icon={<CheckCircle2 aria-hidden="true" />} />
        <StatCard label={t('admin.dashboard.proofsPending')} value={stats.proofs.pending} icon={<ClipboardCheck aria-hidden="true" />} />
        <StatCard label={t('admin.dashboard.reportsRejected')} value={stats.reports.rejected} icon={<FileWarning aria-hidden="true" />} />
        {stats.payments && (
          <StatCard
            label={t(stats.payments.simulated ? 'admin.dashboard.rewardsPaidSimulated' : 'admin.dashboard.rewardsPaid')}
            value={`${stats.payments.rewards_paid_fcfa.toLocaleString('fr-FR')} FCFA`}
            icon={<Banknote aria-hidden="true" />}
          />
        )}
        {stats.marketplace && (
          <StatCard
            label={t('admin.dashboard.handedOverKg')}
            value={kg(stats.marketplace.handed_over_kg)}
            icon={<Factory aria-hidden="true" />}
          />
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-line p-4" aria-labelledby="kg-by-category">
          <h2 id="kg-by-category" className="mb-3 font-bold text-ink">
            {t('admin.dashboard.kgByCategory')}
          </h2>
          {byCategory.length === 0 ? (
            <Empty>{t('admin.dashboard.noVerifiedKg')}</Empty>
          ) : (
            <>
              <div className="h-64">
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={byCategory} dataKey="kg" nameKey="label" innerRadius={50} outerRadius={90}>
                      {byCategory.map((row) => (
                        <Cell key={row.category} fill={COLORS[row.category]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => kg(Number(value))} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="mt-2 grid grid-cols-2 gap-1 text-sm text-ink">
                {byCategory.map((row) => (
                  <li key={row.category} className="flex items-center gap-2">
                    <span aria-hidden="true" className="size-3 rounded-full" style={{ background: COLORS[row.category] }} />
                    {row.label} : {kg(row.kg)}
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        <section className="rounded-2xl border border-line p-4" aria-labelledby="collections">
          <h2 id="collections" className="mb-3 font-bold text-ink">
            {t('admin.dashboard.collectionsByDay')}
          </h2>
          {stats.collections_timeline.every((day) => day.verified_kg === 0 && day.collections === 0) ? (
            <Empty>{t('admin.dashboard.noCollections')}</Empty>
          ) : (
            <div className="h-64">
              <ResponsiveContainer>
                <BarChart data={stats.collections_timeline}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-line)" />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="verified_kg" name={t('admin.dashboard.kg')} fill="var(--color-brand-600)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>
      </div>

      <section className="flex items-center gap-4 rounded-2xl border border-line p-4" aria-labelledby="ai-quality">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-mint text-brand-600">
          <BrainCircuit aria-hidden="true" />
        </span>
        <div>
          <h2 id="ai-quality" className="font-bold text-ink">{t('admin.dashboard.aiTitle')}</h2>
          <p className="text-sm text-ink">
            {agreement === null
              ? t('admin.dashboard.aiNone')
              : t('admin.dashboard.aiAgreement', {
                  rate: Math.round(agreement * 100),
                  count: stats.ai.evaluated,
                })}
          </p>
        </div>
      </section>

      <section className="rounded-2xl border border-line p-4" aria-labelledby="activity">
        <h2 id="activity" className="mb-3 font-bold text-ink">
          {t('admin.dashboard.activity')}
        </h2>
        {stats.recent_activity.length === 0 ? (
          <Empty>{t('admin.dashboard.noActivity')}</Empty>
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {stats.recent_activity.map((item, index) => (
              <ActivityLine key={`${item.at}-${index}`} item={item} />
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
