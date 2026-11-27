import 'leaflet/dist/leaflet.css'

import L from 'leaflet'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { listReports } from '../../api/endpoints.ts'
import type { Report, ReportStatus } from '../../api/types.ts'
import { ErrorMessage, Loading, StatusBadge } from '../../ui/common.tsx'
import { formatDate, useLoad } from '../../ui/load.ts'

// Carte des signalements (§3.8, P1) : OpenStreetMap avec Leaflet, centrée sur Dakar,
// un marqueur par dépôt, couleur et libellé selon le statut. Si les tuiles ne chargent
// pas (pas de réseau), un message le dit et les marqueurs restent visibles ; la liste
// sous la carte donne les mêmes informations.

const DAKAR: L.LatLngTuple = [14.7167, -17.4677]

/** Classes Tailwind du marqueur (jetons du thème, jamais de couleur en dur). */
const MARKER_CLASS: Record<ReportStatus, string> = {
  pending: 'stroke-warning-ink fill-accent',
  approved: 'stroke-brand-900 fill-mint',
  assigned: 'stroke-brand-900 fill-mint',
  collected: 'stroke-brand-900 fill-brand-600',
  completed: 'stroke-brand-900 fill-brand-900',
  rejected: 'stroke-ink fill-muted',
}

function popupContent(report: Report, statusLabel: string): HTMLElement {
  // Construit en DOM (textContent) : aucun texte du citoyen interprété comme du HTML.
  const box = document.createElement('div')
  const title = document.createElement('strong')
  title.textContent = report.tracking_number
  const status = document.createElement('div')
  status.textContent = statusLabel
  const date = document.createElement('div')
  date.textContent = formatDate(report.created_at)
  box.append(title, status, date)
  if (report.comment) {
    const comment = document.createElement('div')
    comment.textContent = report.comment
    box.append(comment)
  }
  return box
}

function ReportsMap({ reports }: { reports: Report[] }) {
  const { t } = useTranslation()
  const container = useRef<HTMLDivElement>(null)
  const [tilesFailed, setTilesFailed] = useState(false)

  useEffect(() => {
    if (!container.current) return
    const map = L.map(container.current, { scrollWheelZoom: false }).setView(DAKAR, 12)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© les contributeurs d’OpenStreetMap',
    })
      .on('tileerror', () => setTilesFailed(true))
      .addTo(map)

    const points: L.LatLngTuple[] = []
    for (const report of reports) {
      if (report.latitude === null || report.longitude === null) continue
      const point: L.LatLngTuple = [report.latitude, report.longitude]
      points.push(point)
      L.circleMarker(point, {
        radius: 9,
        weight: 2,
        fillOpacity: 0.9,
        className: MARKER_CLASS[report.status],
      })
        .bindPopup(popupContent(report, report.status_label))
        .addTo(map)
    }
    if (points.length > 0) map.fitBounds(points, { padding: [32, 32], maxZoom: 15 })
    return () => {
      map.remove()
    }
  }, [reports, t])

  return (
    <div className="flex flex-col gap-2">
      <div
        ref={container}
        role="region"
        aria-label={t('admin.map.label')}
        className="h-[28rem] w-full overflow-hidden rounded-2xl border border-line bg-mint"
      />
      {tilesFailed && (
        <p role="status" className="rounded-xl bg-warning-bg p-3 text-sm text-warning-ink">
          {t('admin.map.tilesFailed')}
        </p>
      )}
    </div>
  )
}

export function AdminMapPage() {
  const { t } = useTranslation()
  const { load, reload } = useLoad(() => listReports())

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-2xl font-bold text-brand-900">{t('admin.map.title')}</h1>
      <ul className="flex flex-wrap gap-3 text-sm text-ink" aria-label={t('admin.map.legend')}>
        {(['pending', 'approved', 'assigned', 'collected', 'completed', 'rejected'] as const).map((status) => (
          <li key={status} className="flex items-center gap-2">
            <svg aria-hidden="true" viewBox="0 0 12 12" className="size-3">
              <circle cx="6" cy="6" r="5" strokeWidth="2" className={MARKER_CLASS[status]} />
            </svg>
            {t(`statuses.report.${status}`)}
          </li>
        ))}
      </ul>
      {load.state === 'loading' && <Loading />}
      {load.state === 'error' && <ErrorMessage code={load.code} onRetry={reload} />}
      {load.state === 'ready' && (
        <>
          <ReportsMap reports={load.data} />
          <ul className="flex flex-col divide-y divide-line rounded-2xl border border-line">
            {load.data.map((report) => (
              <li key={report.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                <span className="font-mono font-bold text-ink">{report.tracking_number}</span>
                <StatusBadge kind="report" status={report.status} label={report.status_label} />
                <span className="text-muted">{formatDate(report.created_at)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
