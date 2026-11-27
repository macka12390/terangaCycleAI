// Base locale de l'appareil (Dexie, IndexedDB).
// - Version 1 : `meta`, réglages clé → valeur (Identifiant d'appareil, consentement).
// - Version 2 : `outbox`, signalements en attente d'envoi (mode hors-ligne, outbox.ts).
import Dexie, { type EntityTable } from 'dexie'

export const DB_NAME = 'terangacycle'

/** Clés connues de `meta` : une faute de frappe est refusée à la compilation. */
export type MetaKey = 'deviceId' | 'consent'

export interface MetaRow {
  key: MetaKey
  value: unknown
}

/** Signalement gardé sur l'appareil faute de réseau ; `clientId` évite tout doublon. */
export interface OutboxRow {
  clientId: string
  photo: Blob
  latitude: number
  longitude: number
  accuracy?: number
  comment?: string
  citizenCategory?: string
  voice?: Blob | null
  /** Horodatage de l'appareil (ms), pour l'ordre d'envoi. */
  createdAt: number
  attempts: number
  /** Dernier code d'erreur de l'API (hors panne réseau), s'il y en a un. */
  lastError?: string
}

export const db = new Dexie(DB_NAME) as Dexie & {
  meta: EntityTable<MetaRow, 'key'>
  outbox: EntityTable<OutboxRow, 'clientId'>
}

db.version(1).stores({ meta: 'key' })
db.version(2).stores({ meta: 'key', outbox: 'clientId, createdAt' })

/** Valeur brute de `meta[key]`, `undefined` si absente. À valider par l'appelant. */
export async function getMeta(key: MetaKey): Promise<unknown> {
  const row = await db.meta.get(key)
  return row?.value
}

export async function setMeta(key: MetaKey, value: unknown): Promise<void> {
  await db.meta.put({ key, value })
}

/** Demande au navigateur de ne pas effacer la base sous pression d'espace. Sans attente
 *  ni erreur : un refus ou une API absente ne change rien au parcours. */
export function requestPersistentStorage(): void {
  try {
    void navigator.storage?.persist?.().catch(() => undefined)
  } catch {
    // API absente ou refusée : le stockage reste « au mieux ».
  }
}
