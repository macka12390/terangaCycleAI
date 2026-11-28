import { PATHS } from '../../paths.ts'

// Utilitaires de l'espace collecteur.

export function missionPath(id: number): string {
  return PATHS.collectorMission.replace(':id', String(id))
}

/** Poids saisi (virgule ou point) ; `null` s'il n'est pas un nombre strictement positif. */
export function parseWeight(raw: string): number | null {
  const value = Number(raw.replace(',', '.').trim())
  return Number.isFinite(value) && value > 0 && value <= 10_000 ? value : null
}

/** Rayon moyen de la Terre (m), pour la distance à vol d'oiseau. */
const EARTH_RADIUS_M = 6_371_000
/** En deçà, le collecteur est considéré arrivé au dépôt (précision GPS d'un téléphone). */
export const ARRIVAL_RADIUS_M = 150

/** Distance à vol d'oiseau entre deux positions, en mètres (formule de haversine). */
export function distanceMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const rad = (degrees: number) => (degrees * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** Distance lisible : « 350 m » ou « 2,4 km ». */
export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters / 10) * 10} m`
  return `${(meters / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} km`
}

/** Lien de navigation vers le dépôt : ouvre l'application de cartes du téléphone. */
export function navigationLink(lat: number, lng: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`
}
