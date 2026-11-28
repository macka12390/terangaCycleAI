import { ChevronRight, MapPin } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router'

import { acceptMission, listMissions } from '../../api/endpoints.ts'
import { errorCode } from '../../api/http.ts'
import type { Mission } from '../../api/types.ts'
import { DemoTag, Empty, ErrorMessage, Loading, StatusBadge } from '../../ui/common.tsx'
import { formatDate, mapLink, useLoad } from '../../ui/load.ts'
import { WasteTypeBadge } from '../classify/WasteTypePicker.tsx'
import { getUser } from '../session/session.ts'
import { missionPath } from './missions.ts'

// Missions du collecteur (§3.5) : disponibles en cartes, acceptation en un toucher (l'API
// refuse un collecteur non vérifié et une mission déjà prise), puis « Mes missions »
// (en cours et historique).

type Tab = 'available' | 'mine'

function MissionCard({ mission, onAccepted }: { mission: Mission; onAccepted?: (id: number) => void }) {
  const { t } = useTranslation()
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const map = mapLink(mission.latitude, mission.longitude)

  async function accept() {
    setBusy(true)
    setFailure(null)
    try {
      await acceptMission(mission.id)
      onAccepted?.(mission.id)
    } catch (error) {
      setFailure(errorCode(error))
      setBusy(false)
    }
  }

  return (
    <article className="overflow-hidden rounded-3xl border border-line bg-white shadow-card transition hover:shadow-lift">
      <div className="relative">
        <img src={mission.photo_before_url} alt={t('collector.photoAlt', { id: mission.tracking_number })} className="h-48 w-full object-cover" />
        <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-brand-950/70 to-transparent" />
        <div className="absolute inset-x-3 top-3 flex flex-wrap justify-end gap-2">
          {mission.is_demo && <DemoTag />}
          <StatusBadge kind="mission" status={mission.status} label={mission.status_label} />
        </div>
        <p className="absolute bottom-3 left-4 font-mono text-sm font-bold text-white">{mission.tracking_number}</p>
      </div>
      <div className="flex flex-col gap-3 p-5">
        {mission.waste_type && <WasteTypeBadge type={mission.waste_type} />}
        <p className="text-sm text-muted">{t('collector.created', { date: formatDate(mission.created_at) })}</p>
        {mission.report_comment && <p className="text-sm text-ink">{mission.report_comment}</p>}
        {map && (
          <a href={map} target="_blank" rel="noreferrer" className="flex min-h-11 items-center gap-2 font-semibold text-brand-600 underline">
            <MapPin aria-hidden="true" className="size-5" />
            {t('collector.route')}
          </a>
        )}
        {failure && <ErrorMessage code={failure} />}
        {onAccepted ? (
          <button
            type="button"
            onClick={() => void accept()}
            disabled={busy}
            className="min-h-12 rounded-2xl bg-gradient-to-r from-brand-900 to-brand-600 text-lg font-bold text-white shadow-card transition hover:shadow-lift disabled:opacity-50"
          >
            {t('collector.accept')}
          </button>
        ) : (
          <Link to={missionPath(mission.id)} className="flex min-h-12 items-center justify-center gap-1 rounded-xl border-2 border-brand-600 font-bold text-brand-600">
            {t('collector.open')}
            <ChevronRight aria-hidden="true" className="size-5" />
          </Link>
        )}
      </div>
    </article>
  )
}

export function CollectorMissionsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('available')
  const { load, reload } = useLoad(() => listMissions(tab), [tab])
  const user = getUser()

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-3xl font-extrabold tracking-tight text-brand-900">{t('collector.title')}</h1>
      {user && !user.is_verified && (
        <p role="alert" className="rounded-xl bg-warning-bg p-3 text-warning-ink">
          {t('collector.notVerified')}
        </p>
      )}
      <div role="tablist" className="grid grid-cols-2 gap-2">
        {(['available', 'mine'] as const).map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            onClick={() => setTab(value)}
            className={`min-h-12 rounded-2xl font-bold transition ${tab === value ? 'bg-brand-600 text-white shadow-card' : 'border border-line bg-white text-ink hover:border-brand-600'}`}
          >
            {t(`collector.tabs.${value}`)}
          </button>
        ))}
      </div>
      {load.state === 'loading' && <Loading />}
      {load.state === 'error' && <ErrorMessage code={load.code} onRetry={reload} />}
      {load.state === 'ready' &&
        (load.data.length === 0 ? (
          <Empty>{t(`collector.empty.${tab}`)}</Empty>
        ) : (
          <div className="flex flex-col gap-4">
            {load.data.map((mission) => (
              <MissionCard
                key={mission.id}
                mission={mission}
                onAccepted={tab === 'available' ? (id) => void navigate(missionPath(id)) : undefined}
              />
            ))}
          </div>
        ))}
    </div>
  )
}
