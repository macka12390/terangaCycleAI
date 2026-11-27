import { describe, expect, it } from 'vitest'

import type { Ai, Report } from '../../api/types.ts'
import { parseWeight } from '../collector/missions.ts'
import { canCorrect, suggestedCategory } from './moderation.ts'

const ai: Ai = {
  mode: 'prototype',
  category: 'plastic',
  confidence: 0.82,
  suggested_category: 'plastic',
  label: 'Suggestion d’un classificateur IA expérimental (prototype)',
}
const base = { ai, citizen_category: null, final_category: null, status: 'pending' } as Report

describe('catégorie préremplie à la modération', () => {
  it('reprend la suggestion de l’IA (60 % ou plus)', () => {
    expect(suggestedCategory(base)).toBe('plastic')
  })

  it('sous 60 % (suggestion nulle) : rien, sauf choix du citoyen', () => {
    const weak = { ...base, ai: { ...ai, confidence: 0.4, suggested_category: null } }
    expect(suggestedCategory(weak)).toBeNull()
    expect(suggestedCategory({ ...weak, citizen_category: 'metal' })).toBe('metal')
  })

  it('la catégorie finale l’emporte, puis le choix du citoyen', () => {
    expect(suggestedCategory({ ...base, citizen_category: 'metal' })).toBe('metal')
    expect(suggestedCategory({ ...base, final_category: 'glass', citizen_category: 'metal' })).toBe(
      'glass',
    )
    expect(suggestedCategory({ ...base, ai: null })).toBeNull()
  })

  it('correction possible tant que les kilos ne sont pas vérifiés', () => {
    expect(canCorrect({ ...base, status: 'approved' })).toBe(true)
    expect(canCorrect({ ...base, status: 'collected' })).toBe(true)
    for (const status of ['pending', 'rejected', 'completed'] as const) {
      expect(canCorrect({ ...base, status })).toBe(false)
    }
  })
})

describe('poids de la preuve', () => {
  it('accepte un nombre positif, avec virgule ou point', () => {
    expect(parseWeight('42,5')).toBe(42.5)
    expect(parseWeight(' 12 ')).toBe(12)
  })

  it('refuse zéro, négatif, texte ou plus de 10 000 kg', () => {
    for (const value of ['0', '-3', 'abc', '', '10001']) expect(parseWeight(value)).toBeNull()
  })
})
