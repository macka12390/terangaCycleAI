// Types du contrat d'API du backend Flask (docs/api-contract.md, branche feature/backend).
// Ce contrat fait foi : toute évolution se décide à deux, dans ce fichier d'abord.

export const CATEGORIES = ['plastic', 'metal', 'paper', 'glass', 'organic'] as const
export type Category = (typeof CATEGORIES)[number]

export type Role = 'citizen' | 'collector' | 'admin' | 'superadmin' | 'recycler'
export type ReportStatus = 'pending' | 'approved' | 'rejected' | 'assigned' | 'collected' | 'completed'
export type MissionStatus = 'available' | 'accepted' | 'completed' | 'cancelled'
export type ProofStatus = 'pending' | 'verified' | 'rejected' | 'disputed'
/** `model` : modèle évalué ; `prototype` : classificateur expérimental ; `manual` : aucune IA. */
export type AiMode = 'model' | 'prototype' | 'manual'

/** Organisation qui traite les dépôts d'une zone (étape 3). */
export interface OrganisationSummary {
  id: number
  name: string
  is_demo: boolean
}

export type OrganisationKind = 'commune' | 'ucg' | 'ong' | 'entreprise'

export interface Zone {
  min_lat: number
  max_lat: number
  min_lng: number
  max_lng: number
}

export interface Organisation extends OrganisationSummary {
  kind: OrganisationKind
  kind_label: string
  zone: Zone
  is_active: boolean
  created_at: string
  counts?: { reports: number; admins: number; collectors: number }
}

export interface User {
  id: number
  name: string
  role: Role
  is_verified: boolean
  is_demo: boolean
  /** Comptes de démonstration seulement ; `null` pour un compte réel (connexion par SMS). */
  demo_login: string | null
  /** Compte réel : numéro E.164 (+221…). */
  phone?: string | null
  // Gestion des comptes (étape 2) : présents dans les réponses de /api/accounts et /auth.
  role_label?: string
  /** Admins et collecteurs : leur organisation ; `null` pour un citoyen ou le super admin. */
  organisation?: OrganisationSummary | null
  is_active?: boolean
  /** SMS de suivi acceptés (étape 4). */
  sms_notifications?: boolean
  suspended_at?: string | null
  suspended_reason?: string | null
  created_at?: string | null
  last_login_at?: string | null
}

/** Entrée du journal d'audit (super admin). */
export interface AuditEntry {
  id: number
  action: string
  action_label: string
  actor: { id: number; name: string } | null
  target: { id: number; name: string } | null
  details: Record<string, unknown> | null
  at: string
}

/** Résultat de classification. `suggested_category` est `null` sous 60 % de confiance. */
export interface Ai {
  mode: AiMode
  category: Category | null
  confidence: number | null
  suggested_category: Category | null
  threshold?: number
  model_version?: string | null
  scores?: Partial<Record<Category, number>> | null
  /** À afficher à côté du résultat : d'où vient la proposition. */
  label: string
}

export interface Report {
  id: number
  tracking_number: string
  status: ReportStatus
  /** `null` : hors de toute zone (à rattacher par le super admin). */
  organisation?: OrganisationSummary | null
  /** Note vocale du citoyen (wolof ou français), ou `null`. */
  voice_url?: string | null
  status_label: string
  photo_url: string
  latitude: number | null
  longitude: number | null
  accuracy_m: number | null
  comment: string | null
  ai: Ai | null
  citizen_category: Category | null
  final_category: Category | null
  /** Meilleure catégorie connue : finale, sinon citoyen, sinon suggestion IA. */
  category: Category | null
  rejection_reason: string | null
  moderated_by: number | null
  moderated_at: string | null
  mission_id: number | null
  user_id: number | null
  is_demo: boolean
  created_at: string
  updated_at: string
}

export interface Tracking {
  tracking_number: string
  status: ReportStatus
  status_label: string
  category: Category | null
  created_at: string
  updated_at: string
  history: { status: ReportStatus; label: string; at: string }[]
}

export interface Person {
  id: number
  name: string
}

export interface Proof {
  id: number
  mission_id: number
  status: ProofStatus
  status_label: string
  photo_after_url: string
  weight_kg: number
  comment: string | null
  collector: Person | null
  verified_by: number | null
  verified_at: string | null
  review_note: string | null
  created_at: string
  report: { id: number; tracking_number: string; waste_type: Category | null; photo_before_url: string }
  is_demo: boolean
}

export interface Mission {
  id: number
  status: MissionStatus
  organisation?: OrganisationSummary | null
  status_label: string
  report_id: number
  tracking_number: string
  latitude: number | null
  longitude: number | null
  waste_type: Category | null
  photo_before_url: string
  report_comment: string | null
  collector: Person | null
  accepted_at: string | null
  started_at: string | null
  completed_at: string | null
  created_at: string
  /** Dernière preuve de la mission, ou `null`. */
  proof: Proof | null
  is_demo: boolean
}

export interface Activity {
  entity: string
  entity_id: number
  report_id: number | null
  tracking_number: string | null
  from_status: string | null
  to_status: string
  /** Libellé français du statut (« Vérifiée »…), à afficher plutôt que `to_status`. */
  to_status_label?: string
  summary?: string
  actor: string | null
  note: string | null
  at: string
}

export interface DashboardStats {
  reports: { total: number; pending: number; validated: number; rejected: number }
  missions: { available: number; accepted: number; completed: number; cancelled: number }
  collections: { completed: number; verified: number }
  proofs: { pending: number; disputed: number; verified: number; rejected: number }
  verified_kg: number
  kg_by_category: { category: Category; label: string; kg: number }[]
  reports_by_category: { category: Category; label: string; count: number }[]
  collections_timeline: { date: string; verified_kg: number; collections: number }[]
  recent_activity: Activity[]
  ai: {
    by_mode: Partial<Record<AiMode, number>>
    evaluated: number
    agreement_rate: number | null
  }
  demo: { included: boolean; demo_reports: number }
  /** Étape 5 : matière vendue aux recycleurs. */
  /** Étape 6 : paiements (simulés tant qu'aucun vrai fournisseur n'est branché). */
  payments?: {
    rewards_paid_fcfa: number
    rewards_due_fcfa: number
    lot_payments_fcfa: number
    simulated: boolean
  }
  marketplace?: {
    available_kg: number
    reserved_kg: number
    handed_over_kg: number
    handed_over_by_category: { category: Category; label: string; kg: number }[]
  }
}

/** Journal des SMS (étape 4). */
export type NotificationStatus = 'pending' | 'sent' | 'failed' | 'skipped'

export interface NotificationEntry {
  id: number
  kind: string
  kind_label: string
  recipient: { id: number; name: string } | null
  recipient_role: Role | null
  /** Toujours masqué : « +221 77 *** ** 01 ». */
  phone: string | null
  message: string
  status: NotificationStatus
  detail: string | null
  attempts: number
  tracking_number: string | null
  created_at: string
  sent_at: string | null
}

/** Lot de matière vérifiée vendu à un recycleur (étape 5). */
export type LotStatus = 'available' | 'reserved' | 'handed_over' | 'cancelled'

export interface LotParty {
  id: number
  name: string
  /** Visible seulement des parties du lot et des admins. */
  phone?: string | null
}

export interface Lot {
  id: number
  category: Category
  category_label: string
  weight_kg: number
  price_per_kg: number | null
  total_price: number | null
  description: string | null
  status: LotStatus
  status_label: string
  collector: LotParty
  recycler: LotParty | null
  organisation: OrganisationSummary | null
  reserved_at: string | null
  handed_over_at: string | null
  created_at: string
  contact_visible: boolean
  /** Étape 6 : paiement du lot par le recycleur, ou `null`. */
  payment?: { id: number; status: PaymentStatus; status_label: string; amount_fcfa: number; is_simulated: boolean } | null
}

/** Paiement mobile money (étape 6). */
export type PaymentStatus = 'pending' | 'processing' | 'succeeded' | 'failed'
export type PaymentKind = 'collector_reward' | 'lot_payment'

export interface PaymentEntry {
  id: number
  kind: PaymentKind
  kind_label: string
  status: PaymentStatus
  status_label: string
  amount_fcfa: number
  weight_kg: number
  price_per_kg: number
  category: Category
  category_label: string
  payee: { id: number; name: string } | null
  payer: { id: number; name: string } | null
  organisation: OrganisationSummary | null
  tracking_number: string | null
  lot_id: number | null
  provider: string
  is_simulated: boolean
  provider_ref: string | null
  failure_reason: string | null
  attempts: number
  created_at: string
  completed_at: string | null
}

export interface PaymentSummary {
  rewards_paid_fcfa: number
  rewards_due_fcfa: number
  lot_payments_fcfa: number
}

export interface PaymentProviderInfo {
  name: string
  simulated: boolean
}
