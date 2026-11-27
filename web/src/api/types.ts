// Types du contrat d'API du backend Flask (docs/api-contract.md, branche feature/backend).
// Ce contrat fait foi : toute évolution se décide à deux, dans ce fichier d'abord.

export const CATEGORIES = ['plastic', 'metal', 'paper', 'glass', 'organic'] as const
export type Category = (typeof CATEGORIES)[number]

export type Role = 'citizen' | 'collector' | 'admin'
export type ReportStatus = 'pending' | 'approved' | 'rejected' | 'assigned' | 'collected' | 'completed'
export type MissionStatus = 'available' | 'accepted' | 'completed' | 'cancelled'
export type ProofStatus = 'pending' | 'verified' | 'rejected' | 'disputed'
/** `model` : modèle évalué ; `prototype` : classificateur expérimental ; `manual` : aucune IA. */
export type AiMode = 'model' | 'prototype' | 'manual'

export interface User {
  id: number
  name: string
  role: Role
  is_verified: boolean
  is_demo: boolean
  demo_login: string
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
}
