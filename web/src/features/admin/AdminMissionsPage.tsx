import { useTranslation } from 'react-i18next'

import { listMissions } from '../../api/endpoints.ts'
import { DemoTag, Empty, ErrorMessage, Loading, StatusBadge } from '../../ui/common.tsx'
import { formatDate, useLoad } from '../../ui/load.ts'
import { WasteTypeBadge } from '../classify/WasteTypePicker.tsx'

// Suivi des missions (§3.5) côté administrateur : statut, collecteur, dates.

export function AdminMissionsPage() {
  const { t } = useTranslation()
  const { load, reload } = useLoad(() => listMissions())

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-3xl font-extrabold tracking-tight text-brand-900">{t('admin.missions.title')}</h1>
      {load.state === 'loading' && <Loading />}
      {load.state === 'error' && <ErrorMessage code={load.code} onRetry={reload} />}
      {load.state === 'ready' &&
        (load.data.length === 0 ? (
          <Empty>{t('admin.missions.empty')}</Empty>
        ) : (
          <div className="overflow-x-auto rounded-3xl border border-line bg-white shadow-card">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="bg-mint text-brand-900">
                <tr>
                  <th scope="col" className="p-3">{t('admin.missions.id')}</th>
                  <th scope="col" className="p-3">{t('admin.missions.category')}</th>
                  <th scope="col" className="p-3">{t('admin.missions.status')}</th>
                  <th scope="col" className="p-3">{t('admin.missions.collector')}</th>
                  <th scope="col" className="p-3">{t('admin.missions.created')}</th>
                  <th scope="col" className="p-3">{t('admin.missions.completed')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {load.data.map((mission) => (
                  <tr key={mission.id}>
                    <td className="p-3 font-mono text-ink">
                      {mission.tracking_number} {mission.is_demo && <DemoTag />}
                    </td>
                    <td className="p-3">{mission.waste_type ? <WasteTypeBadge type={mission.waste_type} /> : '—'}</td>
                    <td className="p-3"><StatusBadge kind="mission" status={mission.status} label={mission.status_label} /></td>
                    <td className="p-3 text-ink">{mission.collector?.name ?? '—'}</td>
                    <td className="p-3 text-muted">{formatDate(mission.created_at)}</td>
                    <td className="p-3 text-muted">{formatDate(mission.completed_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
    </div>
  )
}
