// Appels de l'API Flask, un par route du contrat (docs/api-contract.md). Chaque réponse
// arrive dans l'enveloppe `{ success, … }` : on n'en rend que la partie utile.
import { http } from './http.ts'
import type {
  Ai,
  Category,
  DashboardStats,
  Mission,
  Proof,
  ProofStatus,
  Report,
  ReportStatus,
  Tracking,
  User,
} from './types.ts'

// --- Configuration ------------------------------------------------------------------------

/** Mode démonstration de l'instance (bandeau sur tous les écrans). */
export async function demoMode(): Promise<boolean> {
  const body = (await http.get('/config')).data as { config?: { demo_mode?: unknown } }
  return body.config?.demo_mode === true
}

// --- Authentification de démonstration ---------------------------------------------------

export async function demoAccounts(): Promise<User[]> {
  return (await http.get('/auth/demo-accounts')).data.accounts
}

export async function demoLogin(login: string): Promise<{ token: string; user: User }> {
  const { token, user } = (await http.post('/auth/demo', { login })).data
  return { token, user }
}

export async function me(): Promise<User> {
  return (await http.get('/auth/me')).data.user
}

// --- Classification IA (aperçu avant envoi) -------------------------------------------------

export async function classify(photo: Blob): Promise<Ai> {
  const form = new FormData()
  form.set('photo', photo, 'depot.jpg')
  return (await http.post('/ai/classify', form)).data.ai
}

// --- Signalements -----------------------------------------------------------------------

export interface NewReport {
  /** UUID généré sur l'appareil : un renvoi (hors ligne) ne crée pas de doublon. */
  clientId: string
  photo: Blob
  latitude: number
  longitude: number
  accuracy?: number
  comment?: string
  citizenCategory?: Category
  /** Note vocale (wolof ou français) : envoyée, prise en compte quand l'API l'accepte. */
  voice?: Blob | null
}

export interface CreatedReport {
  report: Report
  ai: Ai | null
  duplicate: boolean
}

export async function createReport(report: NewReport): Promise<CreatedReport> {
  const form = new FormData()
  form.set('client_uuid', report.clientId)
  form.set('photo', report.photo, 'depot.jpg')
  form.set('latitude', String(report.latitude))
  form.set('longitude', String(report.longitude))
  if (report.accuracy !== undefined) form.set('accuracy_m', String(Math.round(report.accuracy)))
  if (report.comment) form.set('comment', report.comment)
  if (report.citizenCategory) form.set('citizen_category', report.citizenCategory)
  if (report.voice) form.set('voice', report.voice, 'note.webm')
  const { report: created, ai, duplicate } = (await http.post('/reports', form)).data
  return { report: created, ai: ai ?? null, duplicate: duplicate === true }
}

export async function listReports(status?: ReportStatus): Promise<Report[]> {
  return (await http.get('/reports', { params: { status, limit: 200 } })).data.reports
}

/** Suivi public par numéro : statut et historique, sans photo ni position. */
export async function trackReport(trackingNumber: string): Promise<Tracking> {
  return (await http.get(`/reports/track/${encodeURIComponent(trackingNumber)}`)).data.tracking
}

export type Moderation =
  | { action: 'approve'; final_category?: Category }
  | { action: 'reject'; reason?: string }
  | { action: 'correct'; final_category: Category }

export async function moderateReport(
  id: number,
  decision: Moderation,
): Promise<{ report: Report; mission: Mission | null }> {
  const { report, mission } = (await http.patch(`/reports/${id}/moderate`, decision)).data
  return { report, mission: mission ?? null }
}

// --- Missions -----------------------------------------------------------------------------

export async function listMissions(scope?: 'available' | 'mine'): Promise<Mission[]> {
  return (await http.get('/missions', { params: { scope } })).data.missions
}

export async function getMission(id: number): Promise<Mission> {
  return (await http.get(`/missions/${id}`)).data.mission
}

export async function acceptMission(id: number): Promise<Mission> {
  return (await http.post(`/missions/${id}/accept`)).data.mission
}

export async function sendProof(
  missionId: number,
  proof: { photo: Blob; weightKg: number; comment?: string },
): Promise<{ proof: Proof; mission: Mission }> {
  const form = new FormData()
  form.set('photo', proof.photo, 'apres.jpg')
  form.set('weight_kg', String(proof.weightKg))
  if (proof.comment) form.set('comment', proof.comment)
  const { proof: created, mission } = (await http.post(`/missions/${missionId}/proof`, form)).data
  return { proof: created, mission }
}

// --- Preuves ------------------------------------------------------------------------------

export async function listProofs(status?: ProofStatus): Promise<Proof[]> {
  return (await http.get('/proofs', { params: { status } })).data.proofs
}

export async function verifyProof(
  id: number,
  decision: 'verified' | 'rejected' | 'disputed',
  note?: string,
): Promise<Proof> {
  return (await http.patch(`/proofs/${id}/verify`, { decision, ...(note ? { note } : {}) })).data
    .proof
}

// --- Tableau de bord ------------------------------------------------------------------------

export async function dashboardStats(): Promise<DashboardStats> {
  return (await http.get('/dashboard/stats')).data.stats
}
