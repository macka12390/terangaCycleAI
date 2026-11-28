// Espaces de démonstration : accueil, comptes de démo, console admin (modération, preuves,
// tableau de bord, carte), espace collecteur (acceptation, preuve). API Flask simulée selon
// son contrat (docs/api-contract.md) ; la boucle contre l'API réelle est dans live.spec.ts.
import { readFileSync } from 'node:fs'

import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page, type Route } from '@playwright/test'

import { AI, PNG, api } from './mock-api.ts'

const fr = JSON.parse(readFileSync(new URL('../src/i18n/fr.json', import.meta.url), 'utf8'))

async function expectAccessible(page: Page) {
  const axe = await new AxeBuilder({ page }).analyze()
  expect(axe.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')).toEqual([])
}

test('accueil : valeur du projet, 4 étapes, accès citoyen et démo', async ({ page }) => {
  await api(page, [])
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1, name: fr.app.name })).toBeVisible()
  await expect(page.getByRole('heading', { name: fr.home.how.title })).toBeVisible()
  await expect(page.getByRole('link', { name: fr.home.report, exact: true })).toBeVisible()
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
