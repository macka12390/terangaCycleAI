import { describe, expect, it } from 'vitest'

import { PATHS } from '../../paths.ts'
import { ROLE_ORDER } from '../admin/accounts.ts'
import { HOME } from '../session/login.ts'
import { formatFcfa, formatKg, isOpen, sellable, telLink, weightProblem } from './lots.ts'

const STOCK = { plastic: 23.5, metal: 0, paper: 25, glass: 0, organic: 0 }

describe('mise en vente', () => {
  it('ne propose que les matières en stock vérifié', () => {
    expect(sellable(STOCK)).toEqual(['plastic', 'paper'])
  })

  it('refuse un poids vide, nul ou supérieur au stock', () => {
    expect(weightProblem('', 23.5)).toBe('missing')
    expect(weightProblem('0', 23.5)).toBe('missing')
    expect(weightProblem('abc', 23.5)).toBe('missing')
    expect(weightProblem('24', 23.5)).toBe('tooMuch')
    expect(weightProblem('23,5', 23.5)).toBeNull()
    expect(weightProblem('10', 23.5)).toBeNull()
  })
})

describe('affichage', () => {
  it('poids et prix en français', () => {
    expect(formatKg(23.5)).toBe('23,5 kg')
    expect(formatFcfa(null)).toBe('—')
    expect(formatFcfa(3000).replace(/\s/g, ' ')).toBe('3 000 FCFA')
  })

  it('lien d’appel seulement si le contact est visible', () => {
    expect(telLink('+221781110002')).toBe('tel:+221781110002')
    expect(telLink(undefined)).toBeNull()
  })

  it('un lot ouvert est disponible ou réservé', () => {
    expect(isOpen({ status: 'available' })).toBe(true)
    expect(isOpen({ status: 'reserved' })).toBe(true)
    expect(isOpen({ status: 'handed_over' })).toBe(false)
    expect(isOpen({ status: 'cancelled' })).toBe(false)
  })
})

describe('rôle recycleur', () => {
  it('arrive sur les lots disponibles et apparaît dans la gestion des comptes', () => {
    expect(HOME.recycler).toBe(PATHS.recycler)
    expect(ROLE_ORDER).toContain('recycler')
  })
})
