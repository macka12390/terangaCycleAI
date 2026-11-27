// Organisations : saisie et contrôle d'une zone (rectangle de latitudes et longitudes).
// Le backend revalide ; ces règles servent à guider la saisie.
import type { OrganisationKind, Zone } from '../../api/types.ts'

export const KINDS: OrganisationKind[] = ['commune', 'ucg', 'ong', 'entreprise']

export type ZoneDraft = Record<keyof Zone, string>

export const EMPTY_ZONE: ZoneDraft = { min_lat: '', max_lat: '', min_lng: '', max_lng: '' }

export function zoneToDraft(zone: Zone): ZoneDraft {
  return {
    min_lat: String(zone.min_lat),
    max_lat: String(zone.max_lat),
    min_lng: String(zone.min_lng),
    max_lng: String(zone.max_lng),
  }
}

/** Nombre saisi au clavier français ou anglais (« 14,7 » ou « 14.7 »). */
function toNumber(raw: string): number | null {
  const value = Number(raw.trim().replace(',', '.'))
  return raw.trim() !== '' && Number.isFinite(value) ? value : null
}

export type ZoneProblem = 'missing' | 'latRange' | 'lngRange' | 'latOrder' | 'lngOrder'

/** Zone valide, ou le premier problème rencontré. */
export function parseZone(draft: ZoneDraft): { zone: Zone } | { problem: ZoneProblem } {
  const values = {
    min_lat: toNumber(draft.min_lat),
    max_lat: toNumber(draft.max_lat),
    min_lng: toNumber(draft.min_lng),
    max_lng: toNumber(draft.max_lng),
  }
  if (Object.values(values).some((value) => value === null)) return { problem: 'missing' }
  const zone = values as Zone
  if ([zone.min_lat, zone.max_lat].some((v) => v < -90 || v > 90)) return { problem: 'latRange' }
  if ([zone.min_lng, zone.max_lng].some((v) => v < -180 || v > 180)) return { problem: 'lngRange' }
  if (zone.min_lat >= zone.max_lat) return { problem: 'latOrder' }
  if (zone.min_lng >= zone.max_lng) return { problem: 'lngOrder' }
  return { zone }
}

/** Taille approximative de la zone, pour se repérer (1° de latitude ≈ 111 km). */
export function zoneSizeKm(zone: Zone): { height: number; width: number } {
  const middle = ((zone.min_lat + zone.max_lat) / 2) * (Math.PI / 180)
  return {
    height: Math.round((zone.max_lat - zone.min_lat) * 111),
    width: Math.round((zone.max_lng - zone.min_lng) * 111 * Math.cos(middle)),
  }
}

/** Lien OpenStreetMap centré sur la zone, pour la vérifier visuellement. */
export function zoneMapLink(zone: Zone): string {
  const params = new URLSearchParams({
    bbox: [zone.min_lng, zone.min_lat, zone.max_lng, zone.max_lat].join(','),
    layer: 'mapnik',
  })
  return `https://www.openstreetmap.org/export/embed.html?${params.toString()}`
}
