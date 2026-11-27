import { describe, expect, it } from 'vitest'

import type { Role, User } from '../../api/types.ts'
import { HOME } from '../session/login.ts'
import { PATHS } from '../../paths.ts'
import { canManage, displayPhone, roleOptions } from './accounts.ts'

function user(id: number, role: Role, extra: Partial<User> = {}): User {
  return { id, name: `U${id}`, role, is_verified: false, is_demo: false, demo_login: null, ...extra }
}

const ADMIN_SCOPE: Role[] = ['citizen', 'collector']
const SUPER_SCOPE: Role[] = ['citizen', 'admin', 'collector', 'superadmin']

describe('qui peut gérer quel compte', () => {
  const admin = user(1, 'admin')
  const boss = user(2, 'superadmin')

  it('un admin gère les collecteurs et les citoyens, pas les admins', () => {
    expect(canManage(admin, user(3, 'collector'), ADMIN_SCOPE)).toBe(true)
    expect(canManage(admin, user(4, 'citizen'), ADMIN_SCOPE)).toBe(true)
    expect(canManage(admin, user(5, 'admin'), ADMIN_SCOPE)).toBe(false)
    expect(canManage(admin, user(6, 'superadmin'), ADMIN_SCOPE)).toBe(false)
  })

  it('un super admin gère tout le monde, sauf lui-même', () => {
    expect(canManage(boss, user(5, 'admin'), SUPER_SCOPE)).toBe(true)
    expect(canManage(boss, boss, SUPER_SCOPE)).toBe(false)
  })

  it('les comptes de démo ne sont jamais modifiables', () => {
    const demo = user(7, 'collector', { is_demo: true, demo_login: 'collecteur-demo' })
    expect(canManage(boss, demo, SUPER_SCOPE)).toBe(false)
  })

  it('sans session, rien n’est modifiable', () => {
    expect(canManage(null, user(3, 'collector'), SUPER_SCOPE)).toBe(false)
  })
})

describe('menu des rôles', () => {
  it('suit un ordre stable, limité aux rôles permis', () => {
    expect(roleOptions(SUPER_SCOPE)).toEqual(['citizen', 'collector', 'admin', 'superadmin'])
    expect(roleOptions(['collector', 'citizen'])).toEqual(['citizen', 'collector'])
  })
})

describe('affichage', () => {
  it('numéro lisible, tiret pour un compte de démo', () => {
    expect(displayPhone('+221771234567')).toBe('+221 77 123 45 67')
    expect(displayPhone(null)).toBe('—')
  })

  it('le super admin arrive sur la console admin', () => {
    expect(HOME.superadmin).toBe(PATHS.admin)
  })
})
