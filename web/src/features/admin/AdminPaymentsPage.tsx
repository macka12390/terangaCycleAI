import { Calculator, Loader2, Save, Send } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  accrueRewards,
  getTariffs,
  listOrganisations,
  listPayments,
  payAllRewards,
  payPayment,
  setTariff,
} from '../../api/endpoints.ts'
import { errorCode } from '../../api/http.ts'
import type { Category } from '../../api/types.ts'
import { Empty, ErrorMessage, Loading, StatCard } from '../../ui/common.tsx'
import { useLoad } from '../../ui/load.ts'
import { WasteTypeBadge } from '../classify/WasteTypePicker.tsx'
import { WASTE_TYPES } from '../classify/wasteTypes.ts'
import { formatFcfa } from '../lots/lots.ts'
import { PaymentRow, SimulatedBanner } from '../payments/PaymentRow.tsx'
import { isDue, sumFcfa } from '../payments/payments.ts'
import { getUser } from '../session/session.ts'

// Paiements (étape 6) : tarifs de rémunération par matière, rémunérations à verser aux
// collecteurs, historique (y compris les lots payés par les recycleurs).

const BUTTON =
  'flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 font-bold transition disabled:opacity-50'

export function AdminPaymentsPage() {
  const { t } = useTranslation()
  const isSuperadmin = getUser()?.role === 'superadmin'
  const organisations = useLoad(
    () => (isSuperadmin ? listOrganisations().then((list) => list.organisations) : Promise.resolve(null)),
    [isSuperadmin],
  ).load
  const [chosen, setChosen] = useState<number | undefined>(undefined)
  const organisationId = isSuperadmin
    ? (chosen ?? (organisations.state === 'ready' ? organisations.data?.[0]?.id : undefined))
    : undefined
  const payments = useLoad(() => listPayments({ organisationId }), [organisationId])
  const [busy, setBusy] = useState<number | 'all' | 'accrue' | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [failure, setFailure] = useState<string | null>(null)

  async function act(key: number | 'all' | 'accrue', action: () => Promise<string>) {
    setBusy(key)
    setFailure(null)
    setNotice(null)
    try {
      setNotice(await action())
      payments.reload()
    } catch (error) {
      setFailure(errorCode(error))
      payments.reload()
    } finally {
      setBusy(null)
    }
  }

  const ready = payments.load.state === 'ready' ? payments.load.data : null
  const due = ready ? ready.payments.filter(isDue) : []

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-extrabold tracking-tight text-brand-900">{t('payments.admin.title')}</h1>
        {isSuperadmin && organisations.state === 'ready' && organisations.data && (
          <label className="ml-auto flex items-center gap-2 text-sm font-semibold text-ink">
            {t('admin.dashboard.organisation')}
            <select
              value={organisationId ?? ''}
              onChange={(event) => setChosen(Number(event.target.value))}
              className="min-h-11 rounded-xl border border-line bg-white px-3 shadow-sm focus:border-brand-600 focus:outline-none"
            >
              {organisations.data.map((organisation) => (
                <option key={organisation.id} value={organisation.id}>
                  {organisation.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <p className="text-muted">{t('payments.admin.intro')}</p>
      {ready && <SimulatedBanner simulated={ready.provider.simulated} />}
      {notice && <p role="status" className="rounded-2xl bg-mint p-4 font-semibold text-brand-900">{notice}</p>}
      {failure && <ErrorMessage code={failure} />}

      {ready && (
        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard label={t('payments.summary.rewardsPaid')} value={formatFcfa(ready.summary.rewards_paid_fcfa)} icon={<Send aria-hidden="true" />} />
          <StatCard label={t('payments.summary.rewardsDue')} value={formatFcfa(ready.summary.rewards_due_fcfa)} icon={<Calculator aria-hidden="true" />} />
          <StatCard label={t('payments.summary.lotPayments')} value={formatFcfa(ready.summary.lot_payments_fcfa)} icon={<Save aria-hidden="true" />} />
        </div>
      )}

      {(!isSuperadmin || organisationId !== undefined) && (
        <TariffEditor key={organisationId ?? 'own'} organisationId={organisationId} />
      )}

      <section aria-labelledby="due-title" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="due-title" className="text-xl font-extrabold tracking-tight text-brand-900">{t('payments.admin.due')}</h2>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() =>
              void act('accrue', async () => t('payments.admin.accrued', { count: await accrueRewards(organisationId) }))
            }
            className={`${BUTTON} ml-auto border border-line bg-white text-ink hover:border-brand-600`}
          >
            <Calculator aria-hidden="true" className="size-5" />
            {t('payments.admin.accrue')}
          </button>
          {due.length > 0 && (
            <button
              type="button"
              disabled={busy !== null}
              onClick={() =>
                void act('all', async () => {
                  const result = await payAllRewards(organisationId)
                  return t('payments.admin.paidAll', { count: result.succeeded, amount: formatFcfa(result.amount_fcfa) })
                })
              }
              className={`${BUTTON} bg-gradient-to-r from-brand-900 to-brand-600 text-white shadow-card hover:shadow-lift`}
            >
              {busy === 'all' ? <Loader2 aria-hidden="true" className="size-5 animate-spin" /> : <Send aria-hidden="true" className="size-5" />}
              {t('payments.admin.payAll', { amount: formatFcfa(sumFcfa(due)) })}
            </button>
          )}
        </div>
        {payments.load.state === 'loading' && <Loading />}
        {payments.load.state === 'error' && <ErrorMessage code={payments.load.code} onRetry={payments.reload} />}
        {ready &&
          (due.length === 0 ? (
            <Empty>{t('payments.admin.noneDue')}</Empty>
          ) : (
            <ul className="flex flex-col gap-3">
              {due.map((payment) => (
                <PaymentRow
                  key={payment.id}
                  payment={payment}
                  action={
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() =>
                        void act(payment.id, async () => {
                          const done = await payPayment(payment.id)
                          return done.status === 'succeeded'
                            ? t('payments.admin.paid', { amount: formatFcfa(done.amount_fcfa), name: done.payee?.name ?? '' })
                            : t('payments.admin.payFailed')
                        })
                      }
                      className={`${BUTTON} bg-gradient-to-r from-brand-900 to-brand-600 text-white shadow-card hover:shadow-lift`}
                    >
                      {busy === payment.id ? <Loader2 aria-hidden="true" className="size-5 animate-spin" /> : <Send aria-hidden="true" className="size-5" />}
                      {payment.status === 'failed' ? t('payments.admin.retry') : t('payments.admin.pay')}
                    </button>
                  }
                />
              ))}
            </ul>
          ))}
      </section>

      <section aria-labelledby="history-title" className="flex flex-col gap-3">
        <h2 id="history-title" className="text-xl font-extrabold tracking-tight text-brand-900">{t('payments.admin.history')}</h2>
        {ready &&
          (ready.payments.filter((payment) => !isDue(payment)).length === 0 ? (
            <Empty>{t('payments.admin.noHistory')}</Empty>
          ) : (
            <ul className="flex flex-col gap-3">
              {ready.payments
                .filter((payment) => !isDue(payment))
                .map((payment) => (
                  <PaymentRow key={payment.id} payment={payment} />
                ))}
            </ul>
          ))}
      </section>
    </div>
  )
}

function TariffEditor({ organisationId }: { organisationId?: number }) {
  const { t } = useTranslation()
  const { load, reload } = useLoad(() => getTariffs(organisationId), [organisationId])
  const [drafts, setDrafts] = useState<Partial<Record<Category, string>>>({})
  const [saving, setSaving] = useState<Category | null>(null)
  const [failure, setFailure] = useState<string | null>(null)

  async function save(category: Category) {
    const raw = drafts[category]
    if (raw === undefined || raw.trim() === '') return
    setSaving(category)
    setFailure(null)
    try {
      await setTariff(category, Number(raw.replace(',', '.')), organisationId)
      setDrafts((current) => ({ ...current, [category]: undefined }))
      reload()
    } catch (error) {
      setFailure(errorCode(error))
    } finally {
      setSaving(null)
    }
  }

  return (
    <section aria-labelledby="tariffs-title" className="flex flex-col gap-3 rounded-3xl border border-line bg-white p-5 shadow-card">
      <h2 id="tariffs-title" className="text-xl font-extrabold tracking-tight text-brand-900">{t('payments.tariffs.title')}</h2>
      <p className="text-sm text-muted">{t('payments.tariffs.intro')}</p>
      {load.state === 'loading' && <Loading />}
      {load.state === 'error' && <ErrorMessage code={load.code} onRetry={reload} />}
      {failure && <ErrorMessage code={failure} />}
      {load.state === 'ready' && load.data && (
        <ul className="flex flex-col gap-2">
          {WASTE_TYPES.map((category) => {
            const current = load.data?.[category] ?? null
            return (
              <li key={category} className="flex flex-wrap items-center gap-2">
                <span className="w-44"><WasteTypeBadge type={category} /></span>
                <input
                  inputMode="numeric"
                  aria-label={t('payments.tariffs.label', { category: t(`waste.${category}`) })}
                  placeholder={current === null ? t('payments.tariffs.none') : String(current)}
                  value={drafts[category] ?? ''}
                  onChange={(event) => setDrafts((d) => ({ ...d, [category]: event.target.value }))}
                  className="min-h-11 w-28 rounded-xl border border-line bg-white px-3 text-ink shadow-sm focus:border-brand-600 focus:outline-none"
                />
                <span className="text-sm text-muted">{t('payments.tariffs.unit')}</span>
                <button
                  type="button"
                  disabled={saving !== null || !drafts[category]?.trim()}
                  onClick={() => void save(category)}
                  className="min-h-11 rounded-xl border-2 border-brand-600 px-3 font-bold text-brand-600 disabled:opacity-40"
                >
                  {saving === category ? <Loader2 aria-hidden="true" className="size-5 animate-spin" /> : t('payments.tariffs.save')}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
