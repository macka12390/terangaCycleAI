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
  AuditEntry,
  NotificationEntry,
  NotificationStatus,
  Organisation,
  OrganisationKind,
  Role,
  Zone,
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

// --- Connexion par code SMS (OTP) ----------------------------------------------------------

export interface OtpSent {
  /** Numéro normalisé par le serveur (+221…). */
  phone: string
  expiresIn: number
  resendIn: number
  /** Mode test seulement (OTP_EXPOSE_CODE) : le code, pour une démo sans accès au serveur. */
  devCode: string | null
}

export async function requestOtp(phone: string): Promise<OtpSent> {
  const body = (await http.post('/auth/otp/request', { phone })).data
  return {
    phone: body.phone,
    expiresIn: body.expires_in,
    resendIn: body.resend_in,
    devCode: typeof body.dev_code === 'string' ? body.dev_code : null,
  }
}

export async function verifyOtp(
  phone: string,
  code: string,
  name?: string,
): Promise<{ token: string; user: User; created: boolean }> {
  const payload: Record<string, string> = { phone, code }
  if (name?.trim()) payload.name = name.trim()
  const { token, user, created } = (await http.post('/auth/otp/verify', payload)).data
  return { token, user, created: created === true }
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

/** `organisationId` (super admin) : un id, ou `'none'` pour les signalements hors zone. */
export async function listReports(
  status?: ReportStatus,
  organisationId?: number | 'none',
): Promise<Report[]> {
  const params = { status, organisation_id: organisationId, limit: 200 }
  return (await http.get('/reports', { params })).data.reports
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

export async function dashboardStats(organisationId?: number): Promise<DashboardStats> {
  const params = organisationId ? { organisation_id: organisationId } : {}
  return (await http.get('/dashboard/stats', { params })).data.stats
}

// --- Comptes (étape 2 : admin et super admin) ----------------------------------------------

export interface AccountFilters {
  role?: Role | ''
  status?: 'active' | 'suspended' | ''
  q?: string
}

export interface AccountList {
  accounts: User[]
  total: number
  /** Rôles que l'utilisateur connecté peut attribuer ou gérer. */
  manageableRoles: Role[]
}

export async function listAccounts(filters: AccountFilters = {}): Promise<AccountList> {
  const params = Object.fromEntries(Object.entries(filters).filter(([, value]) => value))
  const body = (await http.get('/accounts', { params: { ...params, limit: 200 } })).data
  return { accounts: body.accounts, total: body.total, manageableRoles: body.manageable_roles }
}

export interface NewAccount {
  phone: string
  name: string
  role: Role
  is_verified: boolean
  /** Super admin, pour un admin ou un collecteur : organisation du compte. */
  organisation_id?: number
}

export async function createAccount(account: NewAccount): Promise<User> {
  return (await http.post('/accounts', account)).data.account
}

export async function updateAccount(
  id: number,
  changes: Partial<Pick<User, 'name' | 'role' | 'is_verified'>> & { organisation_id?: number },
): Promise<User> {
  return (await http.patch(`/accounts/${id}`, changes)).data.account
}

export async function suspendAccount(
  id: number,
  reason?: string,
): Promise<{ account: User; releasedMissions: number }> {
  const body = (await http.post(`/accounts/${id}/suspend`, reason ? { reason } : {})).data
  return { account: body.account, releasedMissions: body.released_missions }
}

export async function reactivateAccount(id: number): Promise<User> {
  return (await http.post(`/accounts/${id}/reactivate`)).data.account
}

export async function listAudit(): Promise<AuditEntry[]> {
  return (await http.get('/audit', { params: { limit: 50 } })).data.entries
}

// --- Organisations (étape 3) ---------------------------------------------------------------

export interface OrganisationList {
  organisations: Organisation[]
  /** Super admin : signalements hors de toute zone, à rattacher. */
  unassignedReports: number | null
}

export async function listOrganisations(): Promise<OrganisationList> {
  const body = (await http.get('/organisations')).data
  return {
    organisations: body.organisations,
    unassignedReports: typeof body.unassigned_reports === 'number' ? body.unassigned_reports : null,
  }
}

export interface OrganisationInput extends Zone {
  name: string
  kind: OrganisationKind
}

export async function createOrganisation(input: OrganisationInput): Promise<Organisation> {
  return (await http.post('/organisations', input)).data.organisation
}

export async function updateOrganisation(
  id: number,
  changes: Partial<OrganisationInput> & { is_active?: boolean },
): Promise<Organisation> {
  return (await http.patch(`/organisations/${id}`, changes)).data.organisation
}

export async function reassignReport(reportId: number, organisationId: number): Promise<Report> {
  return (await http.patch(`/reports/${reportId}/organisation`, { organisation_id: organisationId })).data
    .report
}

// --- Notifications SMS et compte (étape 4) -------------------------------------------------

export async function updateMe(changes: { name?: string; sms_notifications?: boolean }): Promise<User> {
  return (await http.patch('/auth/me', changes)).data.user
}

export interface NotificationLog {
  notifications: NotificationEntry[]
  /** `console` : mode test, aucun SMS n'est réellement envoyé. */
  provider: string
}

export async function listNotifications(status?: NotificationStatus): Promise<NotificationLog> {
  const body = (await http.get('/notifications', { params: { status, limit: 100 } })).data
  return { notifications: body.notifications, provider: body.provider }
}
