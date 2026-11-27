import { BadgeCheck, Ban, History, Loader2, Plus, RotateCcw, Search, ShieldAlert } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  type AccountFilters,
  createAccount,
  listAccounts,
  listOrganisations,
  listAudit,
  reactivateAccount,
  suspendAccount,
  updateAccount,
} from '../../api/endpoints.ts'
import { errorCode } from '../../api/http.ts'
import type { Organisation, Role, User } from '../../api/types.ts'
import { DemoTag, Empty, ErrorMessage, Loading } from '../../ui/common.tsx'
import { formatDate, useLoad } from '../../ui/load.ts'
import { formatPhone, isSenegalMobile } from '../session/login.ts'
import { getUser } from '../session/session.ts'
import { ROLE_ORDER, canManage, displayPhone, roleOptions } from './accounts.ts'

// Gestion des comptes (étape 2) : créer les comptes collecteurs et admins, vérifier,
// changer de rôle, suspendre ou réactiver. Le super admin voit aussi le journal d'audit.

const FIELD = 'min-h-11 rounded-xl border-2 border-line bg-surface px-3 text-ink focus:border-brand-600 focus:outline-none'
const BUTTON = 'flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 font-bold disabled:opacity-50'

export function AdminAccountsPage() {
  const { t } = useTranslation()
  const me = getUser()
  const [filters, setFilters] = useState<AccountFilters>({ role: '', status: '', q: '' })
  const [search, setSearch] = useState('')
  const { load, reload } = useLoad(() => listAccounts(filters), [filters.role, filters.status, filters.q])
  const [notice, setNotice] = useState<string | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [busy, setBusy] = useState<number | null>(null)
  const [creating, setCreating] = useState(false)
  const [auditVersion, setAuditVersion] = useState(0)
  const isSuperadmin = me?.role === 'superadmin'
  const organisationsLoad = useLoad(
    () => (isSuperadmin ? listOrganisations().then((list) => list.organisations) : Promise.resolve(null)),
    [isSuperadmin],
  ).load
  const organisations = organisationsLoad.state === 'ready' ? organisationsLoad.data : null

  async function run(id: number, action: () => Promise<string>) {
    setBusy(id)
    setFailure(null)
    setNotice(null)
    try {
      setNotice(await action())
      reload()
      setAuditVersion((value) => value + 1)
    } catch (error) {
      setFailure(errorCode(error))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-brand-900">{t('admin.accounts.title')}</h1>
        {!creating && (
          <button type="button" onClick={() => setCreating(true)} className={`${BUTTON} bg-brand-600 text-surface`}>
            <Plus aria-hidden="true" className="size-5" />
            {t('admin.accounts.create.toggle')}
          </button>
        )}
      </div>
      <p className="text-muted">{t('admin.accounts.intro')}</p>

      {notice && (
        <p role="status" className="rounded-xl bg-mint p-3 font-semibold text-brand-900">
          {notice}
        </p>
      )}
      {failure && <ErrorMessage code={failure} />}

      {creating && load.state === 'ready' && (
        <CreateAccountForm
          manageable={load.data.manageableRoles}
          organisations={organisations}
          onCancel={() => setCreating(false)}
          onCreated={(account) => {
            setCreating(false)
            setNotice(t('admin.accounts.create.done', { name: account.name }))
            reload()
            setAuditVersion((value) => value + 1)
          }}
        />
      )}

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm font-semibold text-ink">
          {t('admin.accounts.filters.role')}
          <select
            value={filters.role}
            onChange={(event) => setFilters({ ...filters, role: event.target.value as Role | '' })}
            className={FIELD}
          >
            <option value="">{t('admin.accounts.filters.allRoles')}</option>
            {ROLE_ORDER.map((role) => (
              <option key={role} value={role}>
                {t(`admin.accounts.roles.${role}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold text-ink">
          {t('admin.accounts.filters.status')}
          <select
            value={filters.status}
            onChange={(event) =>
              setFilters({ ...filters, status: event.target.value as AccountFilters['status'] })
            }
            className={FIELD}
          >
            <option value="">{t('admin.accounts.filters.allStatuses')}</option>
            <option value="active">{t('admin.accounts.filters.active')}</option>
            <option value="suspended">{t('admin.accounts.filters.suspended')}</option>
          </select>
        </label>
        <form
          role="search"
          className="flex items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            setFilters({ ...filters, q: search.trim() })
          }}
        >
          <label className="flex flex-col gap-1 text-sm font-semibold text-ink">
            {t('admin.accounts.filters.search')}
            <input value={search} onChange={(event) => setSearch(event.target.value)} className={FIELD} />
          </label>
          <button type="submit" aria-label={t('admin.accounts.filters.searchButton')} className={`${BUTTON} border-2 border-brand-600 text-brand-600`}>
            <Search aria-hidden="true" className="size-5" />
          </button>
        </form>
      </div>

      {load.state === 'loading' && <Loading />}
      {load.state === 'error' && <ErrorMessage code={load.code} onRetry={reload} />}
      {load.state === 'ready' &&
        (load.data.accounts.length === 0 ? (
          <Empty>{t('admin.accounts.list.empty')}</Empty>
        ) : (
          <ul className="flex flex-col gap-3">
            {load.data.accounts.map((account) => (
              <AccountCard
                key={account.id}
                account={account}
                me={me}
                manageable={load.data.manageableRoles}
                organisations={organisations}
                busy={busy === account.id}
                run={(action) => void run(account.id, action)}
              />
            ))}
          </ul>
        ))}

      {me?.role === 'superadmin' && <AuditLog version={auditVersion} />}
    </div>
  )
}

const STAFF: Role[] = ['admin', 'collector']

function AccountCard({
  account,
  me,
  manageable,
  organisations,
  busy,
  run,
}: {
  account: User
  me: User | null
  manageable: Role[]
  /** Super admin seulement : organisations proposées. */
  organisations: Organisation[] | null
  busy: boolean
  run: (action: () => Promise<string>) => void
}) {
  const { t } = useTranslation()
  const [suspending, setSuspending] = useState(false)
  const [reason, setReason] = useState('')
  const editable = canManage(me, account, manageable)
  const active = account.is_active !== false

  return (
    <li className={`flex flex-col gap-3 rounded-2xl border-2 p-4 ${active ? 'border-line' : 'border-danger/60 bg-danger/5'}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-lg font-bold text-ink">{account.name}</span>
        {me?.id === account.id && <span className="text-sm text-muted">({t('admin.accounts.list.you')})</span>}
        <span className="rounded-full bg-mint px-2 py-0.5 text-xs font-bold text-brand-900">
          {t(`admin.accounts.roles.${account.role}`)}
        </span>
        {account.role === 'collector' && (
          <span className={`flex items-center gap-1 text-xs font-bold ${account.is_verified ? 'text-brand-600' : 'text-warning-ink'}`}>
            {account.is_verified && <BadgeCheck aria-hidden="true" className="size-4" />}
            {t(account.is_verified ? 'admin.accounts.list.verified' : 'admin.accounts.list.notVerified')}
          </span>
        )}
        {!active && (
          <span className="flex items-center gap-1 rounded-full bg-danger px-2 py-0.5 text-xs font-bold text-surface">
            <Ban aria-hidden="true" className="size-3" />
            {t('admin.accounts.list.suspended')}
          </span>
        )}
        {account.is_demo && <DemoTag />}
      </div>
      <dl className="grid gap-1 text-sm sm:grid-cols-2">
        <div className="flex gap-2">
          <dt className="text-muted">{t('admin.accounts.list.phone')}</dt>
          <dd className="font-mono text-ink">{displayPhone(account.phone)}</dd>
        </div>
        {account.organisation && (
          <div className="flex gap-2">
            <dt className="text-muted">{t('admin.accounts.list.organisation')}</dt>
            <dd className="text-ink">{account.organisation.name}</dd>
          </div>
        )}
        <div className="flex gap-2">
          <dt className="text-muted">{t('admin.accounts.list.lastLogin')}</dt>
          <dd className="text-ink">
            {account.last_login_at ? formatDate(account.last_login_at) : t('admin.accounts.list.never')}
          </dd>
        </div>
        {!active && account.suspended_reason && (
          <div className="flex gap-2 sm:col-span-2">
            <dt className="text-muted">{t('admin.accounts.actions.reason')}</dt>
            <dd className="text-ink">{account.suspended_reason}</dd>
          </div>
        )}
      </dl>

      {account.is_demo && <p className="text-sm text-muted">{t('admin.accounts.list.demo')}</p>}

      {editable && !suspending && (
        <div className="flex flex-wrap items-center gap-2">
          {account.role === 'collector' && active && (
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  await updateAccount(account.id, { is_verified: !account.is_verified })
                  return t(account.is_verified ? 'admin.accounts.actions.unverified' : 'admin.accounts.actions.verified')
                })
              }
              className={`${BUTTON} border-2 border-brand-600 text-brand-600`}
            >
              <BadgeCheck aria-hidden="true" className="size-5" />
              {t(account.is_verified ? 'admin.accounts.actions.unverify' : 'admin.accounts.actions.verify')}
            </button>
          )}
          {manageable.includes('admin') && active && (
            <label className="flex items-center gap-2 text-sm font-semibold text-ink">
              {t('admin.accounts.actions.role')}
              <select
                value={account.role}
                disabled={busy}
                onChange={(event) => {
                  const role = event.target.value as Role
                  // Admin ou collecteur : rattaché à son organisation actuelle, sinon la première active.
                  const organisationId = STAFF.includes(role)
                    ? (account.organisation?.id ?? organisations?.find((o) => o.is_active)?.id)
                    : undefined
                  run(async () => {
                    await updateAccount(account.id, { role, organisation_id: organisationId })
                    return t('admin.accounts.actions.roleChanged')
                  })
                }}
                className={FIELD}
              >
                {roleOptions(manageable).map((role) => (
                  <option key={role} value={role}>
                    {t(`admin.accounts.roles.${role}`)}
                  </option>
                ))}
              </select>
            </label>
          )}
          {organisations && STAFF.includes(account.role) && active && (
            <label className="flex items-center gap-2 text-sm font-semibold text-ink">
              {t('admin.accounts.list.organisation')}
              <select
                value={account.organisation?.id ?? ''}
                disabled={busy}
                onChange={(event) => {
                  const organisationId = Number(event.target.value)
                  run(async () => {
                    await updateAccount(account.id, { organisation_id: organisationId })
                    return t('admin.accounts.actions.organisationChanged')
                  })
                }}
                className={FIELD}
              >
                {organisations.map((organisation) => (
                  <option key={organisation.id} value={organisation.id}>
                    {organisation.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {active ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => setSuspending(true)}
              className={`${BUTTON} border-2 border-danger text-ink`}
            >
              {/* Rouge en bordure et en icône seulement : trop peu contrasté pour du texte. */}
              <ShieldAlert aria-hidden="true" className="size-5 stroke-danger" />
              {t('admin.accounts.actions.suspend')}
            </button>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  await reactivateAccount(account.id)
                  return t('admin.accounts.actions.reactivated')
                })
              }
              className={`${BUTTON} border-2 border-brand-600 text-brand-600`}
            >
              <RotateCcw aria-hidden="true" className="size-5" />
              {t('admin.accounts.actions.reactivate')}
            </button>
          )}
          {busy && <Loader2 aria-hidden="true" className="size-5 animate-spin text-brand-600" />}
        </div>
      )}

      {editable && suspending && (
        <form
          className="flex flex-col gap-2"
          onSubmit={(event: FormEvent) => {
            event.preventDefault()
            run(async () => {
              const { releasedMissions } = await suspendAccount(account.id, reason.trim() || undefined)
              setSuspending(false)
              setReason('')
              return releasedMissions > 0
                ? t('admin.accounts.actions.suspendedReleased', { count: releasedMissions })
                : t('admin.accounts.actions.suspended')
            })
          }}
        >
          <label className="flex flex-col gap-1 text-sm font-semibold text-ink">
            {t('admin.accounts.actions.reason')}
            <input value={reason} maxLength={500} onChange={(event) => setReason(event.target.value)} className={FIELD} />
          </label>
          {account.role === 'collector' && (
            <p className="text-sm text-muted">{t('admin.accounts.actions.suspendHint')}</p>
          )}
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={busy} className={`${BUTTON} bg-danger text-surface`}>
              <Ban aria-hidden="true" className="size-5" />
              {t('admin.accounts.actions.confirmSuspend')}
            </button>
            <button type="button" onClick={() => setSuspending(false)} className={`${BUTTON} text-brand-600`}>
              {t('admin.accounts.actions.cancel')}
            </button>
          </div>
        </form>
      )}
    </li>
  )
}

function CreateAccountForm({
  manageable,
  organisations,
  onCancel,
  onCreated,
}: {
  manageable: Role[]
  organisations: Organisation[] | null
  onCancel: () => void
  onCreated: (account: User) => void
}) {
  const { t } = useTranslation()
  const options = roleOptions(manageable)
  const [phone, setPhone] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState<Role>(options.includes('collector') ? 'collector' : options[0])
  const [verified, setVerified] = useState(true)
  const activeOrganisations = organisations?.filter((organisation) => organisation.is_active) ?? null
  const [organisationId, setOrganisationId] = useState<number | undefined>(activeOrganisations?.[0]?.id)
  const needsOrganisation = organisations !== null && STAFF.includes(role)
  const [pending, setPending] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const valid =
    isSenegalMobile(phone) && name.trim().length > 0 && (!needsOrganisation || organisationId !== undefined)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!valid || pending) return
    setPending(true)
    setFailure(null)
    try {
      onCreated(
        await createAccount({
          phone,
          name: name.trim(),
          role,
          is_verified: role === 'collector' && verified,
          organisation_id: needsOrganisation ? organisationId : undefined,
        }),
      )
    } catch (error) {
      setFailure(errorCode(error))
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-3 rounded-2xl border-2 border-brand-600 p-4" noValidate>
      <h2 className="text-lg font-bold text-brand-900">{t('admin.accounts.create.title')}</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm font-semibold text-ink">
          {t('admin.accounts.create.phone')}
          <input
            type="tel"
            inputMode="numeric"
            placeholder="77 123 45 67"
            value={phone}
            onChange={(event) => setPhone(formatPhone(event.target.value))}
            className={FIELD}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold text-ink">
          {t('admin.accounts.create.name')}
          <input value={name} maxLength={80} onChange={(event) => setName(event.target.value)} className={FIELD} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold text-ink">
          {t('admin.accounts.create.role')}
          <select value={role} onChange={(event) => setRole(event.target.value as Role)} className={FIELD}>
            {options.map((option) => (
              <option key={option} value={option}>
                {t(`admin.accounts.roles.${option}`)}
              </option>
            ))}
          </select>
        </label>
        {needsOrganisation && activeOrganisations && (
          <label className="flex flex-col gap-1 text-sm font-semibold text-ink">
            {t('admin.accounts.create.organisation')}
            <select
              value={organisationId ?? ''}
              onChange={(event) => setOrganisationId(Number(event.target.value))}
              className={FIELD}
            >
              {activeOrganisations.map((organisation) => (
                <option key={organisation.id} value={organisation.id}>
                  {organisation.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {role === 'collector' && (
          <label className="flex min-h-11 items-center gap-2 self-end text-sm font-semibold text-ink">
            <input type="checkbox" checked={verified} onChange={(event) => setVerified(event.target.checked)} className="size-5" />
            {t('admin.accounts.create.verified')}
          </label>
        )}
      </div>
      {failure && <ErrorMessage code={failure} />}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={!valid || pending} className={`${BUTTON} bg-brand-600 text-surface`}>
          {pending && <Loader2 aria-hidden="true" className="size-5 animate-spin" />}
          {t('admin.accounts.create.submit')}
        </button>
        <button type="button" onClick={onCancel} className={`${BUTTON} text-brand-600`}>
          {t('admin.accounts.actions.cancel')}
        </button>
      </div>
    </form>
  )
}

function AuditLog({ version }: { version: number }) {
  const { t } = useTranslation()
  const { load, reload } = useLoad(listAudit, [version])

  return (
    <section aria-labelledby="audit-title" className="flex flex-col gap-3">
      <h2 id="audit-title" className="flex items-center gap-2 text-xl font-bold text-brand-900">
        <History aria-hidden="true" className="size-5" />
        {t('admin.accounts.audit.title')}
      </h2>
      {load.state === 'loading' && <Loading />}
      {load.state === 'error' && <ErrorMessage code={load.code} onRetry={reload} />}
      {load.state === 'ready' &&
        (load.data.length === 0 ? (
          <Empty>{t('admin.accounts.audit.empty')}</Empty>
        ) : (
          <ol className="flex flex-col divide-y divide-line rounded-2xl border border-line">
            {load.data.map((entry) => (
              <li key={entry.id} className="flex flex-wrap items-baseline gap-x-2 p-3 text-sm">
                <span className="font-bold text-ink">{entry.action_label}</span>
                {entry.target && <span className="text-ink">{t('admin.accounts.audit.on', { name: entry.target.name })}</span>}
                {entry.actor && <span className="text-muted">{t('admin.accounts.audit.by', { name: entry.actor.name })}</span>}
                <span className="ml-auto text-muted">{formatDate(entry.at)}</span>
              </li>
            ))}
          </ol>
        ))}
    </section>
  )
}
