import { describe, expect, it } from 'vitest'

import { distanceMeters, formatDistance, navigationLink } from './missions.ts'

const PLATEAU = { lat: 14.6708, lng: -17.4381 }

describe('distance au dépôt', () => {
  it('vaut zéro sur place et reste symétrique', () => {
    expect(distanceMeters(PLATEAU, PLATEAU)).toBe(0)
    const medina = { lat: 14.6853, lng: -17.4556 }
    expect(distanceMeters(PLATEAU, medina)).toBeCloseTo(distanceMeters(medina, PLATEAU), 6)
  })

  it('donne l’ordre de grandeur attendu à Dakar', () => {
    // Plateau → ancien aéroport de Yoff : environ 9,6 km à vol d'oiseau.
    const yoff = { lat: 14.7397, lng: -17.4902 }
    const km = distanceMeters(PLATEAU, yoff) / 1000
    expect(km).toBeGreaterThan(9)
    expect(km).toBeLessThan(10)
  })

  it('s’affiche en mètres puis en kilomètres', () => {
    expect(formatDistance(347)).toBe('350 m')
    expect(formatDistance(2412)).toBe('2,4 km')
  })

  it('ouvre la navigation vers la position du dépôt', () => {
    expect(navigationLink(14.6708, -17.4381)).toContain('destination=14.6708,-17.4381')
  })
})
