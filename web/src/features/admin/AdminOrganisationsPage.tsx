import { Building2, Loader2, MapPinned, Pencil, Plus, Power } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import { createOrganisation, listOrganisations, updateOrganisation } from '../../api/endpoints.ts'
import { errorCode } from '../../api/http.ts'
import type { Organisation, OrganisationKind } from '../../api/types.ts'
import { PATHS } from '../../paths.ts'
import { DemoTag, Empty, ErrorMessage, Loading } from '../../ui/common.tsx'
import { useLoad } from '../../ui/load.ts'
import {
  EMPTY_ZONE,
  KINDS,
  type ZoneDraft,
  parseZone,
  zoneMapLink,
  zoneSizeKm,
  zoneToDraft,
} from './organisations.ts'

// Organisations (étape 3, super admin) : chaque organisation traite les dépôts de sa zone.
// Un dépôt va à l'organisation active la plus précise ; hors de toute zone, il attend
// d'être rattaché depuis la modération.

const FIELD = 'min-h-11 rounded-xl border-2 border-line bg-surface px-3 text-ink focus:border-brand-600 focus:outline-none'
const BUTTON = 'flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 font-bold disabled:opacity-50'

export function AdminOrganisationsPage() {
  const { t } = useTranslation()
  const { load, reload } = useLoad(listOrganisations)
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<number | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [failure, setFailure] = useState<string | null>(null)

  async function toggle(organisation: Organisation) {
    setFailure(null)
    try {
      await updateOrganisation(organisation.id, { is_active: !organisation.is_active })
      setNotice(t(organisation.is_active ? 'admin.organisations.deactivated' : 'admin.organisations.activated'))
      reload()
    } catch (error) {
      setFailure(errorCode(error))
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-brand-900">{t('admin.organisations.title')}</h1>
        {!creating && (
          <button type="button" onClick={() => setCreating(true)} className={`${BUTTON} bg-brand-600 text-surface`}>
            <Plus aria-hidden="true" className="size-5" />
            {t('admin.organisations.create')}
          </button>
        )}
      </div>
      <p className="text-muted">{t('admin.organisations.intro')}</p>
      {notice && <p role="status" className="rounded-xl bg-mint p-3 font-semibold text-brand-900">{notice}</p>}
      {failure && <ErrorMessage code={failure} />}

      {load.state === 'ready' && (load.data.unassignedReports ?? 0) > 0 && (
        <p className="rounded-xl border-2 border-warning-ink bg-warning-bg p-3 text-ink">
          {t('admin.organisations.unassigned', { count: load.data.unassignedReports ?? 0 })}{' '}
          <Link to={PATHS.adminReports} className="font-bold text-brand-600 underline">
            {t('admin.organisations.unassignedLink')}
          </Link>
        </p>
      )}

      {creating && (
        <OrganisationForm
          onCancel={() => setCreating(false)}
          onSaved={(organisation) => {
            setCreating(false)
            setNotice(t('admin.organisations.created', { name: organisation.name }))
            reload()
          }}
        />
      )}

      {load.state === 'loading' && <Loading />}
      {load.state === 'error' && <ErrorMessage code={load.code} onRetry={reload} />}
      {load.state === 'ready' &&
        (load.data.organisations.length === 0 ? (
          <Empty>{t('admin.organisations.empty')}</Empty>
        ) : (
          <ul className="grid gap-3 lg:grid-cols-2">
            {load.data.organisations.map((organisation) =>
              editing === organisation.id ? (
                <li key={organisation.id}>
                  <OrganisationForm
                    organisation={organisation}
                    onCancel={() => setEditing(null)}
                    onSaved={() => {
                      setEditing(null)
                      setNotice(t('admin.organisations.saved'))
                      reload()
                    }}
                  />
                </li>
              ) : (
                <OrganisationCard
                  key={organisation.id}
                  organisation={organisation}
                  onEdit={() => setEditing(organisation.id)}
                  onToggle={() => void toggle(organisation)}
                />
              ),
            )}
          </ul>
        ))}
    </div>
  )
}

function OrganisationCard({
  organisation,
  onEdit,
  onToggle,
}: {
  organisation: Organisation
  onEdit: () => void
  onToggle: () => void
}) {
  const { t } = useTranslation()
  const size = zoneSizeKm(organisation.zone)
  const counts = organisation.counts

  return (
    <li className={`flex flex-col gap-3 rounded-2xl border-2 p-4 ${organisation.is_active ? 'border-line' : 'border-dashed border-line opacity-70'}`}>
      <div className="flex flex-wrap items-center gap-2">
        <Building2 aria-hidden="true" className="size-5 text-brand-600" />
        <span className="text-lg font-bold text-ink">{organisation.name}</span>
        <span className="rounded-full bg-mint px-2 py-0.5 text-xs font-bold text-brand-900">{organisation.kind_label}</span>
        {!organisation.is_active && (
          <span className="rounded-full bg-ink px-2 py-0.5 text-xs font-bold text-surface">{t('admin.organisations.inactive')}</span>
        )}
        {organisation.is_demo && <DemoTag />}
      </div>
      {counts && (
        <p className="text-sm text-ink">
          {t('admin.organisations.counts', { reports: counts.reports, admins: counts.admins, collectors: counts.collectors })}
        </p>
      )}
      <p className="text-sm text-muted">
        {t('admin.organisations.zone', {
          lat: `${organisation.zone.min_lat} → ${organisation.zone.max_lat}`,
          lng: `${organisation.zone.min_lng} → ${organisation.zone.max_lng}`,
          height: size.height,
          width: size.width,
        })}
      </p>
      <div className="flex flex-wrap gap-2">
        <a href={zoneMapLink(organisation.zone)} target="_blank" rel="noreferrer" className={`${BUTTON} border-2 border-line text-brand-600`}>
          <MapPinned aria-hidden="true" className="size-5" />
          {t('admin.organisations.viewZone')}
        </a>
        <button type="button" onClick={onEdit} className={`${BUTTON} border-2 border-brand-600 text-brand-600`}>
          <Pencil aria-hidden="true" className="size-5" />
          {t('admin.organisations.edit')}
        </button>
        <button type="button" onClick={onToggle} className={`${BUTTON} border-2 border-line text-ink`}>
          <Power aria-hidden="true" className="size-5" />
          {t(organisation.is_active ? 'admin.organisations.deactivate' : 'admin.organisations.activate')}
        </button>
      </div>
    </li>
  )
}

function OrganisationForm({
  organisation,
  onCancel,
  onSaved,
}: {
  organisation?: Organisation
  onCancel: () => void
  onSaved: (organisation: Organisation) => void
}) {
  const { t } = useTranslation()
  const [name, setName] = useState(organisation?.name ?? '')
  const [kind, setKind] = useState<OrganisationKind>(organisation?.kind ?? 'commune')
  const [zone, setZone] = useState<ZoneDraft>(organisation ? zoneToDraft(organisation.zone) : EMPTY_ZONE)
  const [pending, setPending] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const parsed = parseZone(zone)
  const problem = 'problem' in parsed && Object.values(zone).some((value) => value.trim() !== '') ? parsed.problem : null
  const valid = name.trim().length > 0 && 'zone' in parsed

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!valid || !('zone' in parsed) || pending) return
    setPending(true)
    setFailure(null)
    try {
      const input = { name: name.trim(), kind, ...parsed.zone }
      onSaved(organisation ? await updateOrganisation(organisation.id, input) : await createOrganisation(input))
    } catch (error) {
      setFailure(errorCode(error))
    } finally {
      setPending(false)
    }
  }

  const coordinate = (field: keyof ZoneDraft) => (
    <label className="flex flex-col gap-1 text-sm font-semibold text-ink">
      {t(`admin.organisations.fields.${field}`)}
      <input
        inputMode="decimal"
        value={zone[field]}
        onChange={(event) => setZone({ ...zone, [field]: event.target.value })}
        className={FIELD}
      />
    </label>
  )

  return (
    <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-3 rounded-2xl border-2 border-brand-600 p-4" noValidate>
      <h2 className="text-lg font-bold text-brand-900">
        {organisation ? t('admin.organisations.editTitle') : t('admin.organisations.createTitle')}
      </h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm font-semibold text-ink">
          {t('admin.organisations.fields.name')}
          <input value={name} maxLength={120} onChange={(event) => setName(event.target.value)} className={FIELD} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold text-ink">
          {t('admin.organisations.fields.kind')}
          <select value={kind} onChange={(event) => setKind(event.target.value as OrganisationKind)} className={FIELD}>
            {KINDS.map((value) => (
              <option key={value} value={value}>
                {t(`admin.organisations.kinds.${value}`)}
              </option>
            ))}
          </select>
        </label>
        {coordinate('min_lat')}
        {coordinate('max_lat')}
        {coordinate('min_lng')}
        {coordinate('max_lng')}
      </div>
      <p className="text-sm text-muted">{t('admin.organisations.zoneHint')}</p>
      {problem && <p role="alert" className="text-sm font-semibold text-warning-ink">{t(`admin.organisations.problems.${problem}`)}</p>}
      {failure && <ErrorMessage code={failure} />}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={!valid || pending} className={`${BUTTON} bg-brand-600 text-surface`}>
          {pending && <Loader2 aria-hidden="true" className="size-5 animate-spin" />}
          {t('admin.organisations.save')}
        </button>
        <button type="button" onClick={onCancel} className={`${BUTTON} text-brand-600`}>
          {t('admin.accounts.actions.cancel')}
        </button>
      </div>
    </form>
  )
}
