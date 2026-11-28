// Espaces de démonstration : accueil, comptes de démo, console admin (modération, preuves,
// tableau de bord, carte), espace collecteur (acceptation, preuve). API Flask simulée selon
// son contrat (docs/api-contract.md) ; la boucle contre l'API réelle est dans live.spec.ts.
import { readFileSync } from 'node:fs'

import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page, type Route } from '@playwright/test'

const fr = JSON.parse(readFileSync(new URL('../src/i18n/fr.json', import.meta.url), 'utf8'))

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAGCAIAAABxZ0isAAAAFElEQVR4nGM8oaHBgA0wYRWlkwQAppoBJCiW4EgAAAAASUVORK5CYII=',
  'base64',
)
const AI = {
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

async function api(page: Page, calls: string[]) {
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

async function expectAccessible(page: Page) {
  const axe = await new AxeBuilder({ page }).analyze()
  expect(axe.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')).toEqual([])
}

test('accueil : valeur du projet, 4 étapes, accès citoyen et démo', async ({ page }) => {
  await api(page, [])
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1, name: fr.app.name })).toBeVisible()
  await expect(page.getByRole('heading', { name: fr.home.how.title })).toBeVisible()
  await expect(page.getByRole('link', { name: fr.home.report })).toBeVisible()
  await page.getByRole('link', { name: fr.home.demoAccess }).click()
  await expect(page.getByRole('heading', { name: fr.demoLogin.title })).toBeVisible()
  await expect(page.getByText('Collecteur Démo (non vérifié)')).toBeVisible()
  await expectAccessible(page)
})

test('admin : valider un signalement, vérifier une preuve, voir l’impact', async ({ page }) => {
  const calls: string[] = []
  await api(page, calls)
  // Sans session, /admin/reports renvoie vers la connexion ; le compte de démo ramène
  // ensuite à la page demandée (paramètre next).
  await page.goto('/admin/reports')
  await expect(page).toHaveURL(/\/connexion\?next=%2Fadmin%2Freports/)
  await page.goto('/demo?next=%2Fadmin%2Freports')
  await page.getByRole('button', { name: /Admin Démo/ }).click()
  await expect(page.getByRole('heading', { name: fr.admin.reports.title })).toBeVisible()
  await expect(page.getByText('TC-2026-7KQ4MX')).toBeVisible()
  // L'IA propose à 82 % : catégorie préremplie, libellé « prototype » visible.
  await expect(page.getByText(AI.label)).toBeVisible()
  await expect(page.getByRole('button', { name: fr.waste.plastic })).toHaveAttribute('aria-pressed', 'true')
  await expectAccessible(page)
  await page.getByRole('button', { name: fr.admin.reports.validate }).click()
  await expect.poll(() => calls).toContain('PATCH /api/reports/12/moderate')

  await page.getByRole('link', { name: fr.admin.nav.proofs }).click()
  await expect(page.getByText('42,5 kg')).toBeVisible()
  await page.getByRole('button', { name: fr.admin.proofs.verify }).click()
  await expect.poll(() => calls).toContain('PATCH /api/proofs/3/verify')

  await page.getByRole('link', { name: fr.admin.nav.dashboard }).click()
  await expect(page.getByText(fr.admin.dashboard.verifiedKg, { exact: true })).toBeVisible()
  await expect(page.getByText('42,5 kg').first()).toBeVisible()
  await expect(page.getByText(/50 %/)).toBeVisible() // accord IA / décision humaine
  await expect(page.getByText(/Preuve TC-2026-7KQ4MX/)).toBeVisible()
  await expectAccessible(page)
})

test('collecteur : accepter une mission puis envoyer la preuve', async ({ page }) => {
  const calls: string[] = []
  await api(page, calls)
  await page.goto('/demo')
  await page.getByRole('button', { name: /Collecteur Démo \(vérifié\)/ }).click()
  await expect(page.getByRole('heading', { name: fr.collector.title })).toBeVisible()
  await expectAccessible(page)
  await page.getByRole('button', { name: fr.collector.accept }).click()
  await expect.poll(() => calls).toContain('POST /api/missions/5/accept')

  await expect(page.getByRole('heading', { name: fr.collector.proof.title })).toBeVisible()
  const send = page.getByRole('button', { name: fr.collector.proof.send })
  await expect(send).toBeDisabled()
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: fr.photoPicker.gallery }).click()
  await (await chooser).setFiles({ name: 'apres.png', mimeType: 'image/png', buffer: PNG })
  await page.getByLabel(fr.collector.proof.weight).fill('0')
  await expect(send).toBeDisabled()
  await page.getByLabel(fr.collector.proof.weight).fill('42,5')
  await send.click()
  await expect.poll(() => calls).toContain('POST /api/missions/5/proof')
})

test('admin : carte des signalements, avec repli si le fond de carte manque', async ({ page }) => {
  await api(page, [])
  // Pas de réseau vers OpenStreetMap : les tuiles échouent, les points restent.
  await page.route('https://tile.openstreetmap.org/**', (route: Route) => route.abort())
  await page.goto('/demo')
  await page.getByRole('button', { name: /Admin Démo/ }).click()
  await page.getByRole('link', { name: fr.admin.nav.map }).click()
  await expect(page.getByRole('heading', { name: fr.admin.map.title })).toBeVisible()
  await expect(page.getByRole('region', { name: fr.admin.map.label })).toBeVisible()
  await expect(page.locator('path.leaflet-interactive')).toHaveCount(2)
  await expect(page.getByText(fr.admin.map.tilesFailed)).toBeVisible()
  await expect(page.getByText('TC-2026-AB12CD')).toBeVisible()
})

test.describe('carte de mission du collecteur', () => {
  // Le collecteur est à la Médina, à environ 2,4 km du dépôt (Plateau).
  test.use({ geolocation: { latitude: 14.6853, longitude: -17.4556 }, permissions: ['geolocation'] })

  test('dépôt, position en direct, distance et navigation ; rien envoyé au serveur', async ({
    page,
  }) => {
    const calls: string[] = []
    await api(page, calls)
    await page.route('https://tile.openstreetmap.org/**', (route: Route) => route.abort())
    await page.goto('/demo')
    await page.getByRole('button', { name: /Collecteur Démo \(vérifié\)/ }).click()
    await page.getByRole('button', { name: fr.collector.accept }).click()

    await expect(page.getByRole('heading', { name: fr.collector.map.title })).toBeVisible()
    await expect(page.getByRole('region', { name: fr.collector.map.label })).toBeVisible()
    // Dépôt, position du collecteur, cercle de précision et ligne qui les relie.
    await expect(page.locator('path.leaflet-interactive')).toHaveCount(4)
    await expect(page.getByText(/Vous êtes à 2,\d km du dépôt/)).toBeVisible()
    await expect(page.getByText(fr.collector.map.tilesFailed)).toBeVisible()
    await expect(page.getByRole('link', { name: fr.collector.map.navigate })).toHaveAttribute(
      'href',
      /destination=14\.6708,-17\.4381/,
    )
    await expectAccessible(page)
    // La position du collecteur n'est jamais envoyée à l'API.
    expect(calls.some((call) => call.includes('14.6853') || call.includes('position'))).toBe(false)
  })

  test('arrivé à moins de 150 m : « Vous êtes arrivé au dépôt »', async ({ page, context }) => {
    await context.setGeolocation({ latitude: 14.6712, longitude: -17.4383 })
    await api(page, [])
    await page.route('https://tile.openstreetmap.org/**', (route: Route) => route.abort())
    await page.goto('/demo')
    await page.getByRole('button', { name: /Collecteur Démo \(vérifié\)/ }).click()
    await page.getByRole('button', { name: fr.collector.accept }).click()
    await expect(page.getByText(fr.collector.map.arrived)).toBeVisible()
  })
})
