// Responsive : chaque écran sur téléphone (360 px), tablette (768 px) et ordinateur
// (1280 px) — aucun défilement horizontal, logo et titre visibles. API Flask simulée.
import { readFileSync } from 'node:fs'

import { expect, test, type Page, type Route } from '@playwright/test'

import { api } from './mock-api.ts'

const fr = JSON.parse(readFileSync(new URL('../src/i18n/fr.json', import.meta.url), 'utf8'))

const WIDTHS = [
  { name: 'téléphone', width: 360, height: 780 },
  { name: 'tablette', width: 768, height: 1024 },
  { name: 'ordinateur', width: 1280, height: 800 },
] as const

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow).toBeLessThanOrEqual(0)
}

async function login(page: Page, name: RegExp) {
  await page.goto('/demo')
  await page.getByRole('button', { name }).click()
}

for (const { name, width, height } of WIDTHS) {
  test.describe(`${name} (${width} px)`, () => {
    test.use({
      viewport: { width, height },
      geolocation: { latitude: 14.6853, longitude: -17.4556 },
      permissions: ['geolocation'],
    })

    test.beforeEach(async ({ page }) => {
      await api(page, [])
      await page.route('https://tile.openstreetmap.org/**', (route: Route) => route.abort())
    })

    test('accueil, comptes de démo, QR code', async ({ page }) => {
      await page.goto('/')
      await expect(page.getByRole('img', { name: 'TerangaCycle AI' }).first()).toBeVisible()
      await expect(page.getByRole('heading', { level: 1, name: fr.app.name })).toBeVisible()
      await expectNoHorizontalScroll(page)
      await page.goto('/demo')
      await expect(page.getByRole('heading', { name: fr.demoLogin.title })).toBeVisible()
      await expectNoHorizontalScroll(page)
      await page.goto('/citizen/qr')
      await expect(page.getByRole('heading', { name: fr.citizen.qr.title })).toBeVisible()
      await expectNoHorizontalScroll(page)
    })

    test('formulaire citoyen', async ({ page }) => {
      await page.goto('/citizen/report')
      await page.getByRole('button', { name: fr.consent.accept }).click()
      await expect(page.getByRole('heading', { name: fr.citizen.title })).toBeVisible()
      await expect(page.getByRole('button', { name: fr.photoPicker.camera })).toBeVisible()
      await expectNoHorizontalScroll(page)
    })

    test('console admin : impact, modération, missions, preuves, carte', async ({ page }) => {
      await login(page, /Admin Démo/)
      for (const [link, heading] of [
        [fr.admin.nav.dashboard, fr.admin.dashboard.title],
        [fr.admin.nav.reports, fr.admin.reports.title],
        [fr.admin.nav.missions, fr.admin.missions.title],
        [fr.admin.nav.proofs, fr.admin.proofs.title],
        [fr.admin.nav.map, fr.admin.map.title],
      ] as const) {
        await page.getByRole('link', { name: link }).click()
        await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible()
        await expectNoHorizontalScroll(page)
      }
    })

    test('espace collecteur : missions et carte de mission', async ({ page }) => {
      await login(page, /Collecteur Démo \(vérifié\)/)
      await expect(page.getByRole('heading', { name: fr.collector.title })).toBeVisible()
      await expectNoHorizontalScroll(page)
      await page.getByRole('button', { name: fr.collector.accept }).click()
      await expect(page.getByRole('heading', { name: fr.collector.map.title })).toBeVisible()
      await expectNoHorizontalScroll(page)
    })
  })
}
