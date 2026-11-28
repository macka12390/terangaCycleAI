// Simulation de l'API Flask selon son contrat (docs/api-contract.md), partagée par les
// tests des espaces (roles.spec.ts) et du responsive (responsive.spec.ts).
import type { Page, Route } from '@playwright/test'

export const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAGCAIAAABxZ0isAAAAFElEQVR4nGM8oaHBgA0wYRWlkwQAppoBJCiW4EgAAAAASUVORK5CYII=',
  'base64',
)
export const AI = {
  mode: 'prototype',
  category: 'plastic',
  confidence: 0.82,
  suggested_category: 'plastic',
  label: 'Suggestion d’un classificateur IA expérimental (prototype)',
}
const REPORT = {
  id: 12,
  tracking_number: 'TC-2026-7KQ4MX',
  status: 'pending',
  status_label: 'En attente de modération',
  photo_url: '/api/uploads/reports/abc.png',
  latitude: 14.6708,
  longitude: -17.4381,
  accuracy_m: 12,
  comment: 'Près du marché',
  ai: AI,
  citizen_category: null,
  final_category: null,
  category: 'plastic',
  rejection_reason: null,
  is_demo: true,
  created_at: '2026-11-26T09:30:00Z',
  updated_at: '2026-11-26T09:30:00Z',
}
const MISSION = {
  id: 5,
  status: 'available',
  status_label: 'Disponible',
  report_id: 12,
  tracking_number: 'TC-2026-7KQ4MX',
  latitude: 14.6708,
  longitude: -17.4381,
  waste_type: 'plastic',
  photo_before_url: '/api/uploads/reports/abc.png',
  report_comment: 'Près du marché',
  collector: null,
  accepted_at: null,
  started_at: null,
  completed_at: null,
  created_at: '2026-11-26T09:40:00Z',
  proof: null,
  is_demo: true,
}
const PROOF = {
  id: 3,
  mission_id: 5,
  status: 'pending',
  status_label: 'En attente de vérification',
  photo_after_url: '/api/uploads/proofs/def.png',
  weight_kg: 42.5,
  comment: null,
  collector: { id: 3, name: 'Collecteur Démo (vérifié)' },
  verified_by: null,
  verified_at: null,
  review_note: null,
  created_at: '2026-11-26T10:00:00Z',
  report: { id: 12, tracking_number: 'TC-2026-7KQ4MX', waste_type: 'plastic', photo_before_url: '/api/uploads/reports/abc.png' },
  is_demo: true,
}
const STATS = {
  reports: { total: 3, pending: 1, validated: 1, rejected: 1 },
  missions: { available: 0, accepted: 0, completed: 1, cancelled: 0 },
  collections: { completed: 1, verified: 1 },
  proofs: { pending: 0, disputed: 0, verified: 1, rejected: 0 },
  verified_kg: 42.5,
  kg_by_category: [
    { category: 'plastic', label: 'Plastique', kg: 42.5 },
    { category: 'metal', label: 'Métal', kg: 0 },
  ],
  reports_by_category: [],
  collections_timeline: [{ date: '2026-11-26', verified_kg: 42.5, collections: 1 }],
  recent_activity: [
    { entity: 'proof', entity_id: 3, report_id: 12, tracking_number: 'TC-2026-7KQ4MX', from_status: 'pending', to_status: 'verified', actor: 'Admin Démo', note: null, at: '2026-11-26T10:05:00Z' },
  ],
  ai: { by_mode: { prototype: 3 }, evaluated: 2, agreement_rate: 0.5 },
  demo: { included: true, demo_reports: 3 },
}
const ACCOUNTS = [
  { id: 1, name: 'Citoyen Démo', role: 'citizen', is_verified: true, is_demo: true, demo_login: 'citoyen-demo' },
  { id: 2, name: 'Admin Démo', role: 'admin', is_verified: true, is_demo: true, demo_login: 'admin-demo' },
  { id: 3, name: 'Collecteur Démo (vérifié)', role: 'collector', is_verified: true, is_demo: true, demo_login: 'collecteur-demo' },
  { id: 4, name: 'Collecteur Démo (non vérifié)', role: 'collector', is_verified: false, is_demo: true, demo_login: 'collecteur-non-verifie' },
]

export async function api(page: Page, calls: string[]) {
  await page.route('**/api/uploads/**', (route: Route) => route.fulfill({ body: PNG, contentType: 'image/png' }))
  await page.route('**/api/**', async (route: Route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.pathname.startsWith('/api/uploads/')) return route.fallback()
    const key = `${request.method()} ${url.pathname}`
    calls.push(`${key}${url.search}`)
    const body = (() => {
      try {
        return request.postDataJSON() as { login?: string } | null
      } catch {
        return null // corps multipart (photo)
      }
    })()
    const json = (() => {
      switch (key) {
        case 'GET /api/config': return { config: { demo_mode: true } }
        case 'GET /api/auth/demo-accounts': return { accounts: ACCOUNTS }
        case 'POST /api/auth/demo': return { token: 'jeton-demo', user: ACCOUNTS.find((a) => a.demo_login === body?.login) }
        case 'GET /api/reports': {
          const status = url.searchParams.get('status')
          if (status === null) return { reports: [REPORT, { ...REPORT, id: 13, tracking_number: 'TC-2026-AB12CD', status: 'approved', status_label: 'Validé — mission disponible', latitude: 14.69, longitude: -17.45 }], total: 2 }
          return { reports: status === 'pending' ? [REPORT] : [], total: status === 'pending' ? 1 : 0 }
        }
        case 'PATCH /api/reports/12/moderate': return { report: { ...REPORT, status: 'approved', final_category: 'plastic' }, mission: MISSION }
        case 'GET /api/proofs': return { proofs: url.searchParams.get('status') === 'pending' ? [PROOF] : [] }
        case 'PATCH /api/proofs/3/verify': return { proof: { ...PROOF, status: 'verified' } }
        case 'GET /api/dashboard/stats': return { stats: STATS }
        case 'GET /api/missions': return { missions: url.searchParams.get('scope') === 'available' ? [MISSION] : [] }
        case 'POST /api/missions/5/accept': return { mission: { ...MISSION, status: 'accepted', collector: { id: 3, name: 'Collecteur Démo (vérifié)' } } }
        case 'GET /api/missions/5': return { mission: { ...MISSION, status: 'accepted', status_label: 'Acceptée', collector: { id: 3, name: 'Collecteur Démo (vérifié)' } } }
        case 'POST /api/missions/5/proof': return { proof: PROOF, mission: { ...MISSION, status: 'completed' } }
        default: return null
      }
    })()
    if (json === null) {
      await route.fulfill({ status: 404, json: { success: false, error: { code: 'NOT_FOUND', message: '' } } })
    } else {
      await route.fulfill({ json: { success: true, ...json } })
    }
  })
}
