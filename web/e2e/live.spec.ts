// Boucle complète contre l'API Flask RÉELLE (aucune réponse simulée), comme le scénario de
// démonstration du cahier des charges (§11) : signaler → valider → accepter → prouver →
// vérifier → impact. Lancer le backend (api/, `python run.py`), puis :
//   LIVE_API=1 npx playwright test e2e/live.spec.ts
import { readFileSync } from 'node:fs'

import { expect, test } from '@playwright/test'

const fr = JSON.parse(readFileSync(new URL('../src/i18n/fr.json', import.meta.url), 'utf8'))

const PHOTO = {
  name: 'depot.png',
  mimeType: 'image/png',
  buffer: Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAGCAIAAABxZ0isAAAAFElEQVR4nGM8oaHBgA0wYRWlkwQAppoBJCiW4EgAAAAASUVORK5CYII=',
    'base64',
  ),
}

test.skip(!process.env.LIVE_API, 'LIVE_API=1 et le backend Flask démarré sont nécessaires')
test.describe.configure({ mode: 'serial' })
test.use({ geolocation: { latitude: 14.6708, longitude: -17.4381 }, permissions: ['geolocation'] })

let trackingNumber = ''

async function loginAs(page: import('@playwright/test').Page, name: RegExp) {
  await page.goto('/demo')
  await page.getByRole('button', { name }).click()
}

test('1. le citoyen signale un dépôt et reçoit un numéro de suivi', async ({ page }) => {
  await page.goto('/citizen/report')
  await page.getByRole('button', { name: fr.consent.accept }).click()
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: fr.photoPicker.gallery }).click()
  await (await chooser).setFiles(PHOTO)
  await expect(page.getByRole('img', { name: fr.capture.preview.alt })).toBeVisible()
  // Proposition de l'IA (ou mode manuel annoncé comme tel) avant l'envoi.
  await expect(page.getByRole('heading', { name: fr.citizen.ai.proposal })).toBeVisible()
  await page.getByRole('button', { name: fr.waste.plastic }).click()
  await page.getByPlaceholder(fr.details.describe.placeholder).fill('Test de bout en bout')
  await page.getByRole('button', { name: fr.details.send }).click()
  await expect(page.getByRole('heading', { name: fr.citizen.success.title })).toBeVisible()
  trackingNumber = (await page.locator('p.font-mono').first().textContent())?.trim() ?? ''
  expect(trackingNumber).toMatch(/^TC-\d{4}-/)

  await page.getByRole('link', { name: fr.citizen.success.track }).click()
  await expect(page.getByText(trackingNumber)).toBeVisible()
})

test('2. l’admin valide le signalement (mission créée)', async ({ page }) => {
  await loginAs(page, /Admin/)
  await page.getByRole('link', { name: fr.admin.nav.reports }).click()
  const card = page.locator('article', { hasText: trackingNumber })
  await expect(card).toBeVisible()
  await card.getByRole('button', { name: fr.admin.reports.validate }).click()
  await expect(card).toHaveCount(0) // sort de la liste « En attente »
})

test('3. un collecteur non vérifié est refusé', async ({ page }) => {
  await loginAs(page, /non vérifié/)
  const card = page.locator('article', { hasText: trackingNumber })
  await card.getByRole('button', { name: fr.collector.accept }).click()
  await expect(card.getByText(fr.apiErrors.COLLECTOR_NOT_VERIFIED)).toBeVisible()
})

test('4. le collecteur vérifié accepte la mission et envoie sa preuve', async ({ page }) => {
  await loginAs(page, /Collecteur Démo \(vérifié\)/)
  const card = page.locator('article', { hasText: trackingNumber })
  await card.getByRole('button', { name: fr.collector.accept }).click()
  await expect(page.getByRole('heading', { name: fr.collector.proof.title })).toBeVisible()
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: fr.photoPicker.gallery }).click()
  await (await chooser).setFiles(PHOTO)
  await page.getByLabel(fr.collector.proof.weight).fill('23,5')
  await page.getByRole('button', { name: fr.collector.proof.send }).click()
  await expect(page.getByText(fr.collector.proof.sent)).toBeVisible()
})

test('5. l’admin vérifie la preuve et voit les kilos dans l’impact', async ({ page }) => {
  await loginAs(page, /Admin/)
  await page.getByRole('link', { name: fr.admin.nav.proofs }).click()
  const card = page.locator('article', { hasText: trackingNumber })
  await expect(card.getByText('23,5 kg')).toBeVisible()
  await card.getByRole('button', { name: fr.admin.proofs.verify }).click()
  await expect(card).toHaveCount(0)

  await page.getByRole('link', { name: fr.admin.nav.dashboard }).click()
  await expect(page.getByText(fr.admin.dashboard.verifiedKg, { exact: true })).toBeVisible()
  await expect(page.getByText(`${trackingNumber}`).first()).toBeVisible()

  // Suivi public : le signalement est terminé.
  await page.goto(`/citizen/tracking/${trackingNumber}`)
  await expect(page.locator('[aria-current="step"]')).toBeVisible()
})
