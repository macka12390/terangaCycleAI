import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Outlet } from 'react-router'

import { demoMode } from '../api/endpoints.ts'

// Mise en page commune à tous les écrans : bandeau « Mode démonstration » en haut, sans
// bouton de fermeture, tant que `GET /api/config` dit `demo_mode = true`. Sans réponse de
// l'API, aucun bandeau.

export function DemoBanner() {
  const { t } = useTranslation()
  const [demo, setDemo] = useState(false)

  useEffect(() => {
    let active = true
    demoMode().then(
      (value) => active && setDemo(value),
      () => undefined,
    )
    return () => {
      active = false
    }
  }, [])

  if (!demo) return null
  return (
    <section
      aria-label={t('demo.banner')}
      className="bg-accent px-4 py-2 text-center font-bold text-ink"
    >
      {t('demo.banner')}
    </section>
  )
}

export function AppLayout() {
  return (
    <>
      <DemoBanner />
      <Outlet />
    </>
  )
}
