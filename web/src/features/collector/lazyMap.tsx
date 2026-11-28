import { lazy } from 'react'

// Carte de mission chargée à la demande : Leaflet n'alourdit pas l'application du citoyen
// et n'est pas précaché (pwa.config.ts).
export const CollectorMap = lazy(() =>
  import('./CollectorMap.tsx').then((m) => ({ default: m.CollectorMap })),
)
