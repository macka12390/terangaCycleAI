// Espaces de démonstration du MVP : accueil, comptes de démo, console admin (modération,
// preuves, tableau de bord), espace collecteur (acceptation, preuve). API Flask simulée
// selon docs/mvp-24h/contrat-api.md.
import { readFileSync } from 'node:fs'

import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page, type Route } from '@playwright/test'

const fr = JSON.parse(readFileSync(new URL('../src/i18n/fr.json', import.meta.url), 'utf8'))

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAGCAIAAABxZ0isAAAAFElEQVR4nGM8oaHBgA0wYRWlkwQAppoBJCiW4EgAAAAASUVORK5CYII=',
  'base64',
)
const REPORT = {
  id: 12,
  tracking_number: 'TC-2026-000012',
  photo_url: '/uploads/reports/abc.png',
  latitude: 14.6708,
  longitude: -17.4381,
  comment: 'Près du marché',
  voice_url: null,
  ai_category: 'plastic',
  ai_confidence: 0.87,
  ai_mode: 'model',
  citizen_category: null,
  final_category: null,
  status: 'pending',
  rejection_reason: null,
  created_at: '2026-11-26T09:30:00Z',
  updated_at: '2026-11-26T09:30:00Z',
  is_demo: true,
}
const MISSION = {
  id: 5,
  report_id: 12,
  status: 'available',
  collector_id: null,
  collector_name: null,
  category: 'plastic',
  latitude: 14.6708,
  longitude: -17.4381,
  photo_url: '/uploads/reports/abc.png',
  created_at: '2026-11-26T09:40:00Z',
  accepted_at: null,
  completed_at: null,
}
const STATS = {
  reports_total: 3,
  reports_pending: 1,
  reports_validated: 1,
  reports_rejected: 1,
  missions_available: 0,
  collections_completed: 1,
  proofs_pending: 0,
  verified_kg: 42.5,
  kg_by_category: { plastic: 42.5 },
  collections_by_day: [{ date: '2026-11-26', count: 1, kg: 42.5 }],
  recent_activity: [{ at: '2026-11-26T10:00:00Z', type: 'proof_verified', label: 'Collecte TC-2026-000012 vérifiée (42,5 kg)' }],
  includes_demo_data: true,
}

async function api(page: Page, role: 'admin' | 'collector', calls: string[]) {
  const user = { id: role === 'admin' ? 1 : 2, name: role === 'admin' ? 'Admin démo' : 'Collecteur démo', role, is_verified: true, is_demo: true }
  await page.route('**/uploads/**', (route: Route) => route.fulfill({ body: PNG, contentType: 'image/png' }))
  await page.route('**/api/**', async (route: Route) => {
    const request = route.request()
    const url = new URL(request.url())
    const key = `${request.method()} ${url.pathname}`
    calls.push(`${key}${url.search}`)
    const json = (() => {
      switch (key) {
        case 'GET /api/config': return { demo_mode: true }
        case 'POST /api/auth/demo': return { token: 'jeton-demo', user }
        case 'GET /api/reports': {
          const status = url.searchParams.get('status')
          if (status === null) return { items: [REPORT, { ...REPORT, id: 13, tracking_number: 'TC-2026-000013', status: 'validated', latitude: 14.69, longitude: -17.45 }] }
          return { items: status === 'pending' ? [REPORT] : [] }
        }
        case 'PATCH /api/reports/12/moderate': return { report: { ...REPORT, status: 'validated', final_category: 'plastic' }, mission: MISSION }
        case 'GET /api/proofs': return { items: [{ id: 3, mission_id: 5, after_photo_url: '/uploads/proofs/def.png', collected_weight_kg: 42.5, comment: null, status: 'pending', verified_by: null, verified_at: null, created_at: '2026-11-26T10:00:00Z', mission: { ...MISSION, status: 'completed', collector_id: 2, collector_name: 'Collecteur démo' } }] }
        case 'PATCH /api/proofs/3/verify': return { id: 3, status: 'verified' }
        case 'GET /api/dashboard/stats': return STATS
        case 'GET /api/missions': return { items: url.searchParams.get('scope') === 'available' ? [MISSION] : [] }
        case 'POST /api/missions/5/accept': return { ...MISSION, status: 'accepted', collector_id: 2 }
        case 'GET /api/missions/5': return { ...MISSION, status: 'accepted', collector_id: 2 }
        case 'POST /api/missions/5/proof': return { id: 3, status: 'pending' }
        default: return null
      }
    })()
    if (json === null) await route.fulfill({ status: 404, json: { error: { code: 'not_found', message: '' } } })
    else await route.fulfill({ json })
  })
}

async function expectAccessible(page: Page) {
  const axe = await new AxeBuilder({ page }).analyze()
  expect(axe.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')).toEqual([])
}

test('accueil : valeur du projet, 4 étapes, accès citoyen et démo', async ({ page }) => {
  await page.route('**/api/config', (route: Route) => route.fulfill({ json: { demo_mode: true } }))
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1, name: fr.app.name })).toBeVisible()
  await expect(page.getByRole('heading', { name: fr.home.how.title })).toBeVisible()
  await expect(page.getByRole('link', { name: fr.home.report })).toBeVisible()
  await page.getByRole('link', { name: fr.home.demoAccess }).click()
  await expect(page.getByRole('heading', { name: fr.demoLogin.title })).toBeVisible()
  await expectAccessible(page)
})

test('admin : valider un signalement, vérifier une preuve, voir l’impact', async ({ page }) => {
  const calls: string[] = []
  await api(page, 'admin', calls)
  await page.goto('/admin/reports')
  // Sans session : écran des comptes de démo, puis retour à la page demandée.
  await page.getByRole('button', { name: new RegExp(fr.demoLogin.roles.admin.title) }).click()
  await expect(page.getByRole('heading', { name: fr.admin.reports.title })).toBeVisible()
  await expect(page.getByText('TC-2026-000012')).toBeVisible()
  // L'IA est à 87 % : catégorie préremplie, validation possible.
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
  await expect(page.getByText('Collecte TC-2026-000012 vérifiée (42,5 kg)')).toBeVisible()
  await expectAccessible(page)
})

test('collecteur : accepter une mission puis envoyer la preuve', async ({ page }) => {
  const calls: string[] = []
  await api(page, 'collector', calls)
  await page.goto('/demo')
  await page.getByRole('button', { name: new RegExp(fr.demoLogin.roles.collector.title) }).click()
  await expect(page.getByRole('heading', { name: fr.collector.title })).toBeVisible()
  await expectAccessible(page)
  await page.getByRole('button', { name: fr.collector.accept }).click()
  await expect.poll(() => calls).toContain('POST /api/missions/5/accept')

  await expect(page.getByRole('heading', { name: fr.collector.proof.title })).toBeVisible()
  const send = page.getByRole('button', { name: fr.collector.proof.send })
  await expect(send).toBeDisabled()
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: fr.collector.proof.photo }).click()
  await (await chooser).setFiles({ name: 'apres.png', mimeType: 'image/png', buffer: PNG })
  await page.getByLabel(fr.collector.proof.weight).fill('0')
  await expect(send).toBeDisabled()
  await page.getByLabel(fr.collector.proof.weight).fill('42,5')
  await send.click()
  await expect.poll(() => calls).toContain('POST /api/missions/5/proof')
  await expect(page.getByText(fr.collector.proof.sent)).toBeVisible()
})

test('admin : carte des signalements, avec repli si le fond de carte manque', async ({ page }) => {
  const calls: string[] = []
  await api(page, 'admin', calls)
  // Pas de réseau vers OpenStreetMap : les tuiles échouent, les points restent.
  await page.route('https://tile.openstreetmap.org/**', (route: Route) => route.abort())
  await page.goto('/demo')
  await page.getByRole('button', { name: new RegExp(fr.demoLogin.roles.admin.title) }).click()
  await page.getByRole('link', { name: fr.admin.nav.map }).click()
  await expect(page.getByRole('heading', { name: fr.admin.map.title })).toBeVisible()
  await expect(page.getByRole('region', { name: fr.admin.map.label })).toBeVisible()
  await expect(page.locator('path.leaflet-interactive')).toHaveCount(2)
  await expect(page.getByText(fr.admin.map.tilesFailed)).toBeVisible()
  await expect(page.getByText('TC-2026-000013')).toBeVisible()
})

