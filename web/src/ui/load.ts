import { useCallback, useEffect, useState } from 'react'

import { errorCode } from '../api/http.ts'

// Chargement de données des espaces admin et collecteur, et petits utilitaires d'affichage.

export type Load<T> =
  | { state: 'loading' }
  | { state: 'error'; code: string }
  | { state: 'ready'; data: T }

/** Charge `fetcher` au montage ; `reload()` relance (après une action). */
export function useLoad<T>(fetcher: () => Promise<T>, deps: unknown[] = []) {
  const [load, setLoad] = useState<Load<T>>({ state: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let active = true
    fetcher().then(
      (data) => active && setLoad({ state: 'ready', data }),
      (error: unknown) => active && setLoad({ state: 'error', code: errorCode(error) }),
    )
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- dépendances fournies par l'appelant
  }, [attempt, ...deps])

  const reload = useCallback(() => setAttempt((value) => value + 1), [])
  return { load, reload }
}

/** Date et heure lisibles, en français. */
export function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })
}

/** Lien vers la carte OpenStreetMap de la position (itinéraire, consultation). */
export function mapLink(lat: number | null, lng: number | null): string | null {
  if (lat === null || lng === null) return null
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=18/${lat}/${lng}`
}
