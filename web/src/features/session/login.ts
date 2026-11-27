// Connexion par SMS : règles de saisie du numéro et du code, partagées par l'écran et les tests.
// Le serveur revalide tout (normalisation E.164, mobiles sénégalais) : ceci ne sert qu'à guider.
import type { Role } from '../../api/types.ts'
import { PATHS } from '../../paths.ts'

export const OTP_LENGTH = 6

/** Chiffres du numéro sans l'indicatif : « +221 77 123 45 67 » → « 771234567 ». */
export function localDigits(raw: string): string {
  let digits = raw.replace(/\D/g, '')
  if (digits.startsWith('00221')) digits = digits.slice(5)
  else if (digits.startsWith('221') && digits.length > 9) digits = digits.slice(3)
  return digits
}

/** Mobile sénégalais : 9 chiffres commençant par 70, 71, 75, 76, 77 ou 78. */
export function isSenegalMobile(raw: string): boolean {
  return /^7[015678]\d{7}$/.test(localDigits(raw))
}

/** Saisie regroupée au fil de la frappe : « 771234567 » → « 77 123 45 67 ». */
export function formatPhone(raw: string): string {
  const digits = localDigits(raw).slice(0, 9)
  return [digits.slice(0, 2), digits.slice(2, 5), digits.slice(5, 7), digits.slice(7, 9)]
    .filter(Boolean)
    .join(' ')
}

/** Code reçu : chiffres seulement, 6 au plus (un collage « 123 456 » fonctionne). */
export function cleanCode(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, OTP_LENGTH)
}

export const HOME: Record<Role, string> = {
  citizen: PATHS.citizenReport,
  collector: PATHS.collector,
  admin: PATHS.admin,
  superadmin: PATHS.admin,
}

/** Après connexion : la page demandée si c'est un chemin interne, sinon l'espace du rôle. */
export function nextPath(next: string | null, role: Role): string {
  if (next && next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/\\')) {
    return next
  }
  return HOME[role]
}
