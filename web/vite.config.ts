import tailwindcss from '@tailwindcss/vite'
import basicSsl from '@vitejs/plugin-basic-ssl'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig } from 'vitest/config'

import {
  MANIFEST,
  NAVIGATE_FALLBACK_DENYLIST,
  PRECACHE_GLOB_IGNORES,
  PRECACHE_GLOB_PATTERNS,
} from './pwa.config.ts'

// Développement et prévisualisation : l'API Flask (port 5000) est relayée sous la même
// origine, sans CORS ; ses photos sont servies sous /api/uploads.
const API_PROXY = { '/api': 'http://127.0.0.1:5000' }

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [
    // `npm run dev:mobile` : HTTPS auto-signé, pour que le téléphone autorise le GPS.
    ...(mode === 'mobile' ? [basicSsl()] : []),
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        ...MANIFEST,
        icons: MANIFEST.icons.map((icon) => ({ ...icon })),
      },
      workbox: {
        globPatterns: PRECACHE_GLOB_PATTERNS,
        globIgnores: PRECACHE_GLOB_IGNORES,
        navigateFallbackDenylist: NAVIGATE_FALLBACK_DENYLIST,
      },
    }),
  ],
  server: { proxy: API_PROXY },
  // Prévisualisation de la PWA construite (tests de bout en bout contre l'API réelle).
  preview: { proxy: API_PROXY },
  test: {
    // Vitest seulement : les parcours Playwright (e2e/*.spec.ts) tournent à part (npm run test:e2e).
    include: ['src/**/*.test.{ts,tsx}'],
  },
}))
