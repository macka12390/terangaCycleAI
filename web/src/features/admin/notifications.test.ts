import { describe, expect, it } from 'vitest'

import { STATUS_STYLE, skipReason } from './notifications.ts'

describe('journal des SMS', () => {
  it('explique pourquoi un SMS n’est pas parti', () => {
    expect(skipReason({ status: 'skipped', detail: 'no_phone' })).toBe('no_phone')
    expect(skipReason({ status: 'skipped', detail: 'opted_out' })).toBe('opted_out')
    expect(skipReason({ status: 'skipped', detail: null })).toBe('no_phone')
    expect(skipReason({ status: 'failed', detail: 'ConnectionError' })).toBe('error')
  })

  it('rien à expliquer pour un SMS envoyé ou en attente', () => {
    expect(skipReason({ status: 'sent', detail: null })).toBeNull()
    expect(skipReason({ status: 'pending', detail: null })).toBeNull()
  })

  it('chaque statut a son style', () => {
    expect(Object.keys(STATUS_STYLE).sort()).toEqual(['failed', 'pending', 'sent', 'skipped'])
  })
})
