import { describe, expect, it } from 'vitest'

import type { Report } from '../../api/types.ts'
import { canReassign } from './moderation.ts'
import { EMPTY_ZONE, parseZone, zoneMapLink, zoneSizeKm, zoneToDraft } from './organisations.ts'

const PIKINE = { min_lat: 14.73, max_lat: 14.81, min_lng: -17.42, max_lng: -17.33 }

describe('saisie d’une zone', () => {
  it('accepte la virgule décimale et les longitudes négatives', () => {
    const parsed = parseZone({ min_lat: '14,73', max_lat: '14.81', min_lng: '-17,42', max_lng: '-17.33' })
    expect(parsed).toEqual({ zone: PIKINE })
  })

  it('signale le premier problème rencontré', () => {
    expect(parseZone(EMPTY_ZONE)).toEqual({ problem: 'missing' })
    expect(parseZone({ ...zoneToDraft(PIKINE), max_lat: '95' })).toEqual({ problem: 'latRange' })
    expect(parseZone({ ...zoneToDraft(PIKINE), min_lng: '-200' })).toEqual({ problem: 'lngRange' })
    expect(parseZone({ ...zoneToDraft(PIKINE), min_lat: '14.9' })).toEqual({ problem: 'latOrder' })
    expect(parseZone({ ...zoneToDraft(PIKINE), max_lng: '-17.5' })).toEqual({ problem: 'lngOrder' })
    expect(parseZone({ ...zoneToDraft(PIKINE), max_lng: 'abc' })).toEqual({ problem: 'missing' })
  })

  it('donne une taille lisible en kilomètres', () => {
    expect(zoneSizeKm(PIKINE)).toEqual({ height: 9, width: 10 })
  })

  it('ouvre la zone sur OpenStreetMap (ouest, sud, est, nord)', () => {
    const url = new URL(zoneMapLink(PIKINE))
    expect(url.hostname).toBe('www.openstreetmap.org')
    expect(url.searchParams.get('bbox')).toBe('-17.42,14.73,-17.33,14.81')
  })
})

describe('rattachement d’un signalement', () => {
  const report = (status: Report['status']) => ({ status }) as Report

  it('possible tant qu’aucun collecteur n’intervient', () => {
    expect(canReassign(report('pending'))).toBe(true)
    expect(canReassign(report('approved'))).toBe(true)
    expect(canReassign(report('rejected'))).toBe(true)
    expect(canReassign(report('assigned'))).toBe(false)
    expect(canReassign(report('collected'))).toBe(false)
    expect(canReassign(report('completed'))).toBe(false)
  })
})
