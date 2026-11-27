import 'fake-indexeddb/auto'

import { beforeEach, describe, expect, it } from 'vitest'

import type { CreatedReport, NewReport } from '../api/endpoints.ts'
import { db } from './db.ts'
import { enqueue, flush, pendingCount } from './outbox.ts'

class NetworkDown extends Error {}

function report(clientId: string): NewReport {
  return { clientId, photo: new Blob(['jpeg']), latitude: 14.67, longitude: -17.43 }
}

const created = (clientId: string) =>
  ({ report: { tracking_number: `TC-${clientId}` }, ai: null, duplicate: false }) as unknown as CreatedReport

beforeEach(async () => {
  await db.outbox.clear()
})

describe('file hors-ligne', () => {
  it('garde le signalement, photo comprise, puis l’envoie dans l’ordre', async () => {
    await enqueue(report('a'))
    await enqueue(report('b'))
    expect(await pendingCount()).toBe(2)
    const order: string[] = []
    const result = await flush(
      async (r) => {
        order.push(r.clientId)
        expect(r.photo).toBeInstanceOf(Blob)
        return created(r.clientId)
      },
      () => false,
    )
    expect(order).toEqual(['a', 'b'])
    expect(result).toMatchObject({ online: true })
    expect(result.sent.map((r) => r.report.tracking_number)).toEqual(['TC-a', 'TC-b'])
    expect(await pendingCount()).toBe(0)
  })

  it('une panne réseau arrête l’envoi sans rien perdre', async () => {
    await enqueue(report('a'))
    await enqueue(report('b'))
    const result = await flush(
      () => Promise.reject(new NetworkDown()),
      (error) => error instanceof NetworkDown,
    )
    expect(result).toEqual({ sent: [], online: false })
    expect(await pendingCount()).toBe(2)
  })

  it('une erreur de l’API est notée et le signalement reste gardé', async () => {
    await enqueue(report('a'))
    await flush(
      () => Promise.reject(new Error('validation_error')),
      () => false,
    )
    const row = await db.outbox.get('a')
    expect(row).toMatchObject({ attempts: 1, lastError: 'validation_error' })
  })

  it('le même identifiant client n’est gardé qu’une fois (pas de doublon)', async () => {
    await enqueue(report('a'))
    await enqueue(report('a'))
    expect(await pendingCount()).toBe(1)
  })
})
