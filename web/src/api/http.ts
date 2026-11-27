// Client HTTP unique (Axios) vers l'API Flask. Ajoute le jeton de démonstration et
// traduit toute erreur en `ApiError` (code du contrat, ou `network` sans réponse).
import axios, { AxiosError } from 'axios'

import { getToken } from '../features/session/session.ts'

export class ApiError extends Error {
  /** Code d'erreur du contrat (`mission_already_taken`…) ou `network`. */
  readonly code: string
  readonly status: number

  constructor(code: string, status: number) {
    super(code)
    this.name = 'ApiError'
    this.code = code
    this.status = status
  }
}

export const http = axios.create({ baseURL: '/api', timeout: 30_000 })

http.interceptors.request.use((config) => {
  const token = getToken()
  if (token) config.headers.set('Authorization', `Bearer ${token}`)
  return config
})

http.interceptors.response.use(undefined, (error: unknown) => {
  if (error instanceof AxiosError && error.response) {
    const body = error.response.data as { error?: { code?: unknown } } | undefined
    const code = typeof body?.error?.code === 'string' ? body.error.code : 'server_error'
    return Promise.reject(new ApiError(code, error.response.status))
  }
  return Promise.reject(new ApiError('network', 0))
})

/** Code d'erreur d'une exception quelconque (pour choisir le message à afficher). */
export function errorCode(error: unknown): string {
  return error instanceof ApiError ? error.code : 'network'
}
