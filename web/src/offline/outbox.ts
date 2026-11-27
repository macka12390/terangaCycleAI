// File hors-ligne des signalements citoyens (cahier des charges §3.9, P1).
// Sans réseau, le signalement (photo comprise) est gardé dans IndexedDB ; il est envoyé
// au retour du réseau (événement `online`, ouverture de l'écran, bouton « Envoyer
// maintenant »). Le `client_uuid` généré sur l'appareil évite tout doublon côté serveur
// (un renvoi reçoit le signalement existant).
import type { CreatedReport, NewReport } from '../api/endpoints.ts'
import type { Category } from '../api/types.ts'
import { db, type OutboxRow } from './db.ts'

export async function enqueue(report: NewReport): Promise<void> {
  await db.outbox.put({
    clientId: report.clientId,
    photo: report.photo,
    latitude: report.latitude,
    longitude: report.longitude,
    accuracy: report.accuracy,
    comment: report.comment,
    citizenCategory: report.citizenCategory,
    voice: report.voice ?? null,
    createdAt: Date.now(),
    attempts: 0,
  })
}

export async function pendingCount(): Promise<number> {
  return db.outbox.count()
}

export function toNewReport(row: OutboxRow): NewReport {
  return {
    clientId: row.clientId,
    photo: row.photo,
    latitude: row.latitude,
    longitude: row.longitude,
    accuracy: row.accuracy,
    comment: row.comment,
    citizenCategory: row.citizenCategory as Category | undefined,
    voice: row.voice ?? null,
  }
}

export interface FlushResult {
  sent: CreatedReport[]
  /** Faux si l'envoi s'est arrêté sur une panne réseau (les suivants attendent). */
  online: boolean
}

let flushing: Promise<FlushResult> | null = null

/**
 * Envoie la file dans l'ordre. Une panne réseau arrête l'envoi (tout reste gardé) ; une
 * autre erreur est notée sur la ligne, qui reste gardée pour un nouvel essai. Un seul
 * envoi à la fois : un second appel attend le premier.
 */
export function flush(
  send: (report: NewReport) => Promise<CreatedReport>,
  isNetworkError: (error: unknown) => boolean,
): Promise<FlushResult> {
  flushing ??= (async () => {
    const sent: CreatedReport[] = []
    try {
      for (const row of await db.outbox.orderBy('createdAt').toArray()) {
        try {
          sent.push(await send(toNewReport(row)))
          await db.outbox.delete(row.clientId)
        } catch (error) {
          if (isNetworkError(error)) return { sent, online: false }
          await db.outbox.update(row.clientId, {
            attempts: row.attempts + 1,
            lastError: error instanceof Error ? error.message : 'error',
          })
        }
      }
      return { sent, online: true }
    } finally {
      flushing = null
    }
  })()
  return flushing
}
