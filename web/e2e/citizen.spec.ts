// Espace citoyen du MVP 24 h : signalement en un écran (modèle SenAlerte), QR code, suivi.
// L'API Flask est simulée (contrat docs/mvp-24h/contrat-api.md) ; GPS simulé par Playwright.
import { readFileSync } from 'node:fs'

import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page, type Route } from '@playwright/test'

const fr = JSON.parse(readFileSync(new URL('../src/i18n/fr.json', import.meta.url), 'utf8')) as {
  consent: { accept: string }
  capture: { trigger: string; preview: { alt: string } }
  details: { send: string }
  citizen: {
    title: string
    missing: { photo: string }
    success: { title: string; track: string }
    ai: { proposal: string; manual: string }
    qr: { title: string; alt: string }
    tracking: { title: string }
    status: { pending: string }
    offline: { title: string; sendNow: string }
  }
  waste: { plastic: string }
}

const PHOTO = {
  name: 'depot.png',
  mimeType: 'image/png',
  buffer: Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAGCAIAAABxZ0isAAAAFElEQVR4nGM8oaHBgA0wYRWlkwQAppoBJCiW4EgAAAAASUVORK5CYII=',
    'base64',
  ),
}

const REPORT = {
  id: 12,
  tracking_number: 'TC-2026-000012',
  photo_url: '/uploads/reports/abc.jpg',
  latitude: 14.6708,
  longitude: -17.4381,
  comment: null,
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

test.use({ geolocation: { latitude: 14.6708, longitude: -17.4381 }, permissions: ['geolocation'] })

async function openForm(page: Page) {
  await page.route('**/api/config', (route: Route) =>
    route.fulfill({ json: { demo_mode: true } }),
  )
  await page.goto('/citizen/report')
  await page.getByRole('button', { name: fr.consent.accept }).click()
  await expect(page.getByRole('heading', { name: fr.citizen.title })).toBeVisible()
}

test('signalement en un écran : photo, position, envoi, numéro et proposition IA', async ({
  page,
}) => {
  let sent = ''
  await page.route('**/api/reports', async (route: Route) => {
    sent = route.request().postDataBuffer()?.toString('utf8') ?? ''
    await route.fulfill({ status: 201, json: REPORT })
  })
  await openForm(page)

  const send = page.getByRole('button', { name: fr.details.send })
  await expect(send).toBeDisabled()
  await expect(page.getByText(fr.citizen.missing.photo)).toBeVisible()

  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: fr.capture.trigger }).click()
  await (await chooser).setFiles(PHOTO)
  await expect(page.getByRole('img', { name: fr.capture.preview.alt })).toBeVisible()
  await page.getByRole('button', { name: fr.waste.plastic }).click()

  await expect(send).toBeEnabled()
  const axe = await new AxeBuilder({ page }).analyze()
  expect(axe.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')).toEqual(
    [],
  )
  await send.click()

  await expect(page.getByRole('heading', { name: fr.citizen.success.title })).toBeVisible()
  await expect(page.getByText('TC-2026-000012')).toBeVisible()
  await expect(page.getByText(fr.citizen.ai.proposal)).toBeVisible()
  for (const field of ['client_id', 'latitude', 'longitude', 'citizen_category', 'photo']) {
    expect(sent).toContain(`name="${field}"`)
  }
  expect(sent).toContain('plastic')
})

test('sans modèle IA : « classification manuelle » affichée, jamais une fausse prédiction', async ({
  page,
}) => {
  await page.route('**/api/reports', (route: Route) =>
    route.fulfill({
      status: 201,
      json: { ...REPORT, ai_mode: 'manual', ai_category: null, ai_confidence: null },
    }),
  )
  await openForm(page)
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: fr.capture.trigger }).click()
  await (await chooser).setFiles(PHOTO)
  await page.getByRole('button', { name: fr.details.send }).click()
  await expect(page.getByText(fr.citizen.ai.manual)).toBeVisible()
  await expect(page.getByText(fr.citizen.ai.proposal)).toHaveCount(0)
})

test('suivi par numéro et QR code généré sur place', async ({ page }) => {
  const external: string[] = []
  page.on('request', (request) => {
    if (!request.url().startsWith('http://127.0.0.1')) external.push(request.url())
  })
  await page.route('**/api/reports/TC-2026-000012', (route: Route) =>
    route.fulfill({ json: REPORT }),
  )
  await page.goto('/citizen/tracking/TC-2026-000012')
  await expect(page.getByRole('heading', { name: fr.citizen.tracking.title })).toBeVisible()
  await expect(page.locator('[aria-current="step"]')).toHaveText(fr.citizen.status.pending)

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
    clientIds.push(/name="client_id"\s+([0-9a-f-]{36})/.exec(body)?.[1] ?? '')
    await route.fulfill({ status: 201, json: REPORT })
  })
  await openForm(page)
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: fr.capture.trigger }).click()
  await (await chooser).setFiles(PHOTO)
  await page.getByRole('button', { name: fr.details.send }).click()
  await expect(page.getByRole('heading', { name: fr.citizen.offline.title })).toBeVisible()

  // Retour au formulaire : le signalement attend ; le réseau revient, on l'envoie.
  await page.goto('/citizen/report')
  await expect(page.getByText("1 signalement en attente d'envoi")).toBeVisible()
  online = true
  await page.getByRole('button', { name: fr.citizen.offline.sendNow }).click()
  await expect(page.getByText('Envoyé : TC-2026-000012')).toBeVisible()
  expect(clientIds).toHaveLength(1)
  expect(clientIds[0]).toMatch(/^[0-9a-f-]{36}$/)
})

