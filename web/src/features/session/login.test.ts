import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { User } from '../../api/types.ts'
import { PATHS } from '../../paths.ts'
import { cleanCode, formatPhone, isSenegalMobile, localDigits, nextPath } from './login.ts'
import { clearSession, getToken, getUser, saveSession } from './session.ts'

describe('numéro de téléphone', () => {
  it.each([
    ['77 123 45 67', '771234567'],
    ['+221 77 123 45 67', '771234567'],
    ['00221771234567', '771234567'],
    ['221771234567', '771234567'],
    ['771234567', '771234567'],
  ])('%s → chiffres locaux %s', (raw, digits) => {
    expect(localDigits(raw)).toBe(digits)
    expect(isSenegalMobile(raw)).toBe(true)
  })

  it.each(['', '7712345', '33 823 45 67', '+33 6 12 34 56 78', '79 123 45 67', '7712345678'])(
    'refuse %s',
    (raw) => {
      expect(isSenegalMobile(raw)).toBe(false)
    },
  )

  it('regroupe la saisie au fil de la frappe', () => {
    expect(formatPhone('7')).toBe('7')
    expect(formatPhone('771')).toBe('77 1')
    expect(formatPhone('7712345')).toBe('77 123 45')
    expect(formatPhone('771234567')).toBe('77 123 45 67')
    expect(formatPhone('77123456789')).toBe('77 123 45 67')
    expect(formatPhone('+221771234567')).toBe('77 123 45 67')
  })
})

describe('code reçu', () => {
  it('garde 6 chiffres, même collés avec des espaces', () => {
    expect(cleanCode('123 456')).toBe('123456')
    expect(cleanCode('12a34b56789')).toBe('123456')
  })
})

describe('page après connexion', () => {
  it('reprend la page demandée si elle est interne', () => {
    expect(nextPath('/admin/proofs', 'admin')).toBe('/admin/proofs')
  })

  it('ignore une adresse externe et renvoie vers l’espace du rôle', () => {
    expect(nextPath('//exemple.com', 'citizen')).toBe(PATHS.citizenReport)
    expect(nextPath('https://exemple.com', 'collector')).toBe(PATHS.collector)
    expect(nextPath('/\\exemple.com', 'admin')).toBe(PATHS.admin)
    expect(nextPath(null, 'admin')).toBe(PATHS.admin)
  })
})

/** Stockage du navigateur en mémoire (les tests tournent sous Node, sans DOM). */
class MemoryStorage implements Storage {
  private items = new Map<string, string>()
  get length() {
    return this.items.size
  }
  clear() {
    this.items.clear()
  }
  getItem(key: string) {
    return this.items.get(key) ?? null
  }
  key(index: number) {
    return [...this.items.keys()][index] ?? null
  }
  removeItem(key: string) {
    this.items.delete(key)
  }
  setItem(key: string, value: string) {
    this.items.set(key, String(value))
  }
}

describe('session', () => {
  vi.stubGlobal('localStorage', new MemoryStorage())
  vi.stubGlobal('sessionStorage', new MemoryStorage())

  const user: User = {
    id: 7,
    name: 'Awa',
    role: 'citizen',
    is_verified: false,
    is_demo: false,
    demo_login: null,
    phone: '+221771234567',
  }

  beforeEach(() => {
    clearSession()
  })

  it('un compte réel reste connecté sur l’appareil', () => {
    saveSession('jeton-reel', user, { persist: true })
    expect(localStorage.getItem('tc-session')).not.toBeNull()
    expect(sessionStorage.getItem('tc-demo-session')).toBeNull()
    expect(getToken()).toBe('jeton-reel')
    expect(getUser()?.phone).toBe('+221771234567')
  })

  it('une session de démo reste limitée à l’onglet et remplace la précédente', () => {
    saveSession('jeton-reel', user, { persist: true })
    saveSession('jeton-demo', { ...user, is_demo: true, demo_login: 'citoyen-demo' })
    expect(localStorage.getItem('tc-session')).toBeNull()
    expect(getToken()).toBe('jeton-demo')
  })

  it('la déconnexion efface les deux', () => {
    saveSession('jeton-reel', user, { persist: true })
    clearSession()
    expect(getToken()).toBeNull()
    expect(getUser()).toBeNull()
  })
})
