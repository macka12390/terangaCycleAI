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
  // Développement : l'API Flask (port 5000) est relayée sous la même origine, sans CORS.
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:5000',
      '/uploads': 'http://127.0.0.1:5000',
    },
  },
  test: {
    // Vitest seulement : les parcours Playwright (e2e/*.spec.ts) tournent à part (npm run test:e2e).
    include: ['src/**/*.test.{ts,tsx}'],
  },
}))
