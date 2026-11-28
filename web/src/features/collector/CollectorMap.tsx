import 'leaflet/dist/leaflet.css'

import L from 'leaflet'
import { LocateFixed, Navigation } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ARRIVAL_RADIUS_M, distanceMeters, formatDistance, navigationLink } from './missions.ts'

// Carte de la mission sur le téléphone du collecteur : le dépôt, sa propre position en
// direct et la ligne qui les relie, avec la distance restante. La position du collecteur
// reste sur son téléphone : elle n'est jamais envoyée au serveur. Le trajet routier est
// confié à l'application de cartes du téléphone (« Démarrer la navigation »). Sans fond
// de carte (pas de réseau), un message le dit ; les points et la distance restent.

type Fix =
  | { state: 'locating' }
  | { state: 'located'; lat: number; lng: number; accuracy: number }
  | { state: 'error'; reason: 'denied' | 'unavailable' | 'insecure' }

function initialFix(): Fix {
  if (!window.isSecureContext) return { state: 'error', reason: 'insecure' }
  if (!('geolocation' in navigator)) return { state: 'error', reason: 'unavailable' }
  return { state: 'locating' }
}

/** Position du collecteur suivie en direct (arrêtée en quittant l'écran). */
function useLivePosition(): Fix {
  const [fix, setFix] = useState<Fix>(initialFix)

  useEffect(() => {
    if (initialFix().state === 'error') return
    const watch = navigator.geolocation.watchPosition(
      (position) =>
        setFix({
          state: 'located',
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
        }),
      (error) => setFix({ state: 'error', reason: error.code === 1 ? 'denied' : 'unavailable' }),
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 5_000 },
    )
    return () => navigator.geolocation.clearWatch(watch)
  }, [])

  return fix
}

export function CollectorMap({ lat, lng }: { lat: number; lng: number }) {
  const { t } = useTranslation()
  const container = useRef<HTMLDivElement>(null)
  const layers = useRef<{
    map: L.Map
    me: L.CircleMarker
    halo: L.Circle
    line: L.Polyline
    fitted: boolean
  } | null>(null)
  const [tilesFailed, setTilesFailed] = useState(false)
  const fix = useLivePosition()

  // Carte créée une fois, centrée sur le dépôt.
  useEffect(() => {
    if (!container.current) return
    const map = L.map(container.current, { scrollWheelZoom: false }).setView([lat, lng], 16)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© les contributeurs d’OpenStreetMap',
    })
      .on('tileerror', () => setTilesFailed(true))
      .addTo(map)
    L.circleMarker([lat, lng], {
      radius: 11,
      weight: 3,
      fillOpacity: 0.9,
      className: 'stroke-ink fill-accent',
    })
      .bindTooltip(t('collector.map.dump'), { permanent: false })
      .addTo(map)
    layers.current = {
      map,
      me: L.circleMarker([lat, lng], { radius: 8, weight: 3, fillOpacity: 1, className: 'stroke-surface fill-brand-600' }),
      halo: L.circle([lat, lng], { radius: 1, weight: 1, fillOpacity: 0.15, className: 'stroke-brand-600 fill-brand-600' }),
      line: L.polyline([], { weight: 3, dashArray: '6 8', className: 'stroke-brand-900' }),
      fitted: false,
    }
    return () => {
      map.remove()
      layers.current = null
    }
  }, [lat, lng, t])

  // Position du collecteur mise à jour à chaque mesure ; vue ajustée à la première.
  useEffect(() => {
    const current = layers.current
    if (!current || fix.state !== 'located') return
    const me: L.LatLngTuple = [fix.lat, fix.lng]
    current.me.setLatLng(me).addTo(current.map)
    current.halo.setLatLng(me).setRadius(fix.accuracy).addTo(current.map)
    current.line.setLatLngs([me, [lat, lng]]).addTo(current.map)
    if (!current.fitted) {
      current.map.fitBounds([me, [lat, lng]], { padding: [40, 40], maxZoom: 17 })
      current.fitted = true
    }
  }, [fix, lat, lng])

  const distance = fix.state === 'located' ? distanceMeters(fix, { lat, lng }) : null

  return (
    <section aria-labelledby="mission-map" className="flex flex-col gap-3">
      <h2 id="mission-map" className="text-lg font-bold text-brand-900">
        {t('collector.map.title')}
      </h2>
      <div
        ref={container}
        role="region"
        aria-label={t('collector.map.label')}
        className="h-72 w-full overflow-hidden rounded-2xl border border-line bg-mint"
      />
      <p role="status" className="flex items-center gap-2 text-ink">
        <LocateFixed aria-hidden="true" className="size-5 shrink-0 text-brand-600" />
        {fix.state === 'locating' && t('capture.position.locating')}
        {fix.state === 'error' && t(`citizen.position.${fix.reason}`)}
        {distance !== null &&
          (distance <= ARRIVAL_RADIUS_M
            ? t('collector.map.arrived')
            : t('collector.map.distance', { distance: formatDistance(distance) }))}
      </p>
      {tilesFailed && (
        <p className="rounded-xl bg-warning-bg p-3 text-sm text-warning-ink">{t('collector.map.tilesFailed')}</p>
      )}
      <a
        href={navigationLink(lat, lng)}
        target="_blank"
        rel="noreferrer"
        className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-brand-900 text-lg font-bold text-surface"
      >
        <Navigation aria-hidden="true" className="size-5" />
        {t('collector.map.navigate')}
      </a>
      <p className="text-xs text-muted">{t('collector.map.privacy')}</p>
    </section>
  )
}
