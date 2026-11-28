// Espace citoyen : signalement en un écran (modèle SenAlerte), proposition de l'IA avant
// l'envoi, QR code, suivi, mode hors-ligne. L'API Flask est simulée selon son contrat
// (docs/api-contract.md) ; la boucle contre l'API réelle est dans live.spec.ts.
import { readFileSync } from 'node:fs'

import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page, type Route } from '@playwright/test'

const fr = JSON.parse(readFileSync(new URL('../src/i18n/fr.json', import.meta.url), 'utf8'))

const PHOTO = {
  name: 'depot.png',
  mimeType: 'image/png',
  buffer: Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAGCAIAAABxZ0isAAAAFElEQVR4nGM8oaHBgA0wYRWlkwQAppoBJCiW4EgAAAAASUVORK5CYII=',
    'base64',
  ),
}

const AI = {
  mode: 'prototype',
  category: 'plastic',
  confidence: 0.82,
  suggested_category: 'plastic',
  threshold: 0.6,
  label: 'Suggestion d’un classificateur IA expérimental (prototype)',
}
const MANUAL = {
  mode: 'manual',
  category: null,
  confidence: null,
  suggested_category: null,
  label: 'Classification manuelle',
}
const REPORT = {
  id: 12,
  tracking_number: 'TC-2026-7KQ4MX',
  status: 'pending',
  status_label: 'En attente de modération',
  photo_url: '/api/uploads/reports/abc.jpg',
  latitude: 14.6708,
  longitude: -17.4381,
  accuracy_m: 12,
  comment: null,
  ai: AI,
  citizen_category: 'plastic',
  final_category: null,
  category: 'plastic',
  rejection_reason: null,
  is_demo: false,
  created_at: '2026-11-26T09:30:00Z',
  updated_at: '2026-11-26T09:30:00Z',
}

test.use({ geolocation: { latitude: 14.6708, longitude: -17.4381 }, permissions: ['geolocation'] })

async function openForm(page: Page, ai: object = AI) {
  await page.route('**/api/config', (route: Route) =>
    route.fulfill({ json: { success: true, config: { demo_mode: true } } }),
  )
  await page.route('**/api/ai/classify', (route: Route) =>
    route.fulfill({ json: { success: true, ai } }),
  )
  await page.goto('/citizen/report')
  await page.getByRole('button', { name: fr.consent.accept }).click()
  await expect(page.getByRole('heading', { name: fr.citizen.title })).toBeVisible()
}

async function addPhoto(page: Page, button: string = fr.photoPicker.camera) {
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: button }).click()
  await (await chooser).setFiles(PHOTO)
  await expect(page.getByRole('img', { name: fr.capture.preview.alt })).toBeVisible()
}

test('deux boutons photo : appareil photo arrière ou galerie', async ({ page }) => {
  await openForm(page)
  await expect(page.getByTestId('camera-input')).toHaveAttribute('capture', 'environment')
  expect(await page.getByTestId('gallery-input').getAttribute('capture')).toBeNull()
  await expect(page.getByRole('button', { name: fr.photoPicker.camera })).toBeVisible()
  await expect(page.getByRole('button', { name: fr.photoPicker.gallery })).toBeVisible()
})

test('signalement : proposition de l’IA avant l’envoi, puis numéro de suivi', async ({ page }) => {
  let sent = ''
  await page.route('**/api/reports', async (route: Route) => {
    sent = route.request().postDataBuffer()?.toString('utf8') ?? ''
    await route.fulfill({
      status: 201,
      json: { success: true, report: REPORT, ai: AI, duplicate: false },
    })
  })
  await openForm(page)

  const send = page.getByRole('button', { name: fr.details.send })
  await expect(send).toBeDisabled()
  await expect(page.getByText(fr.citizen.missing.photo)).toBeVisible()

  await addPhoto(page, fr.photoPicker.gallery)
  // L'IA propose (82 %) : catégorie préremplie, libellé « prototype » affiché.
  await expect(page.getByText(AI.label)).toBeVisible()
  await expect(page.getByRole('button', { name: fr.waste.plastic })).toHaveAttribute(
    'aria-pressed',
    'true',
  )

  await expect(send).toBeEnabled()
  const axe = await new AxeBuilder({ page }).analyze()
  expect(axe.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')).toEqual(
    [],
  )
  await send.click()

  await expect(page.getByRole('heading', { name: fr.citizen.success.title })).toBeVisible()
  await expect(page.getByText(REPORT.tracking_number)).toBeVisible()
  for (const field of ['client_uuid', 'latitude', 'longitude', 'accuracy_m', 'citizen_category', 'photo']) {
    expect(sent).toContain(`name="${field}"`)
  }
})

test('IA absente : rien de présélectionné, jamais de fausse prédiction', async ({ page }) => {
  await openForm(page, MANUAL)
  await addPhoto(page)
  await expect(page.getByText(fr.citizen.ai.manual)).toBeVisible()
  await expect(page.getByRole('button', { name: fr.waste.plastic })).toHaveAttribute(
    'aria-pressed',
    'false',
  )
})

test('suivi par numéro et QR code généré sur place', async ({ page }) => {
  const external: string[] = []
  page.on('request', (request) => {
    if (!request.url().startsWith('http://127.0.0.1')) external.push(request.url())
  })
  await page.route('**/api/reports/track/TC-2026-7KQ4MX', (route: Route) =>
    route.fulfill({
      json: {
        success: true,
        tracking: {
          tracking_number: 'TC-2026-7KQ4MX',
          status: 'approved',
          status_label: 'Validé — mission disponible',
          category: 'plastic',
          created_at: '2026-11-26T09:30:00Z',
          updated_at: '2026-11-26T10:00:00Z',
          history: [
            { status: 'pending', label: 'En attente de modération', at: '2026-11-26T09:30:00Z' },
            { status: 'approved', label: 'Validé — mission disponible', at: '2026-11-26T10:00:00Z' },
          ],
        },
      },
    }),
  )
  await page.goto('/citizen/tracking/TC-2026-7KQ4MX')
  await expect(page.getByRole('heading', { name: fr.citizen.tracking.title })).toBeVisible()
  await expect(page.locator('[aria-current="step"]')).toContainText('Validé — mission disponible')

  await page.goto('/citizen/qr')
  await expect(page.getByRole('heading', { name: fr.citizen.qr.title })).toBeVisible()
  await expect(page.locator('svg title', { hasText: fr.citizen.qr.alt })).toHaveCount(1)
  expect(external).toEqual([]) // aucun service de QR code externe
})

test('sans réseau : gardé sur le téléphone, puis envoyé au retour du réseau sans doublon', async ({
  page,
}) => {
  let online = false
  const clientIds: string[] = []
  await page.route('**/api/reports', async (route: Route) => {
    if (!online) {
      await route.abort('internetdisconnected')
      return
    }
    const body = route.request().postDataBuffer()?.toString('utf8') ?? ''
    clientIds.push(/name="client_uuid"\s+([0-9a-f-]{36})/.exec(body)?.[1] ?? '')
    await route.fulfill({
      status: 201,
      json: { success: true, report: REPORT, ai: AI, duplicate: false },
    })
  })
  await openForm(page)
  await addPhoto(page)
  await page.getByRole('button', { name: fr.details.send }).click()
  await expect(page.getByRole('heading', { name: fr.citizen.offline.title })).toBeVisible()

  await page.goto('/citizen/report')
  await expect(page.getByText("1 signalement en attente d'envoi")).toBeVisible()
  online = true
  await page.getByRole('button', { name: fr.citizen.offline.sendNow }).click()
  await expect(page.getByText(`Envoyé : ${REPORT.tracking_number}`)).toBeVisible()
  expect(clientIds).toHaveLength(1)
  expect(clientIds[0]).toMatch(/^[0-9a-f-]{36}$/)
})
