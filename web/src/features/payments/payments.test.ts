import { describe, expect, it } from 'vitest'

import type { Lot } from '../../api/types.ts'
import { canPayLot, isDue, sumFcfa } from './payments.ts'

const lot = (overrides: Partial<Lot> = {}): Lot =>
  ({
    id: 1,
    status: 'reserved',
    price_per_kg: 150,
    recycler: { id: 9, name: 'Recyclage Dakar' },
    payment: null,
    ...overrides,
  }) as Lot

describe('rémunérations à verser', () => {
  it('à payer ou à relancer, jamais un paiement de lot ni un paiement fait', () => {
    expect(isDue({ kind: 'collector_reward', status: 'pending' })).toBe(true)
    expect(isDue({ kind: 'collector_reward', status: 'failed' })).toBe(true)
    expect(isDue({ kind: 'collector_reward', status: 'succeeded' })).toBe(false)
    expect(isDue({ kind: 'collector_reward', status: 'processing' })).toBe(false)
    expect(isDue({ kind: 'lot_payment', status: 'pending' })).toBe(false)
  })

  it('additionne les montants', () => {
    expect(sumFcfa([{ amount_fcfa: 2350 }, { amount_fcfa: 600 }])).toBe(2950)
    expect(sumFcfa([])).toBe(0)
  })
})

describe('paiement d’un lot par le recycleur', () => {
  it('seulement le recycleur qui a réservé, un lot avec prix, pas déjà payé', () => {
    expect(canPayLot(lot(), 9)).toBe(true)
    expect(canPayLot(lot({ status: 'handed_over' }), 9)).toBe(true)
    expect(canPayLot(lot(), 10)).toBe(false)
    expect(canPayLot(lot(), undefined)).toBe(false)
    expect(canPayLot(lot({ status: 'available' }), 9)).toBe(false)
    expect(canPayLot(lot({ price_per_kg: null }), 9)).toBe(false)
    const paid = { id: 3, status: 'succeeded' as const, status_label: 'Payé', amount_fcfa: 3000, is_simulated: true }
    expect(canPayLot(lot({ payment: paid }), 9)).toBe(false)
    expect(canPayLot(lot({ payment: { ...paid, status: 'failed' } }), 9)).toBe(true)
  })
})
