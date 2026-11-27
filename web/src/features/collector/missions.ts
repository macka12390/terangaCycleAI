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
