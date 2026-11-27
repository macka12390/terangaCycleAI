// Marketplace (étape 5) : règles d'affichage des lots, partagées par les espaces collecteur,
// recycleur et admin. Le backend applique les vraies règles (stock vérifié, réservation).
import type { Category, Lot } from '../../api/types.ts'

/** « 23,5 kg » */
export function formatKg(value: number): string {
  return `${value.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} kg`
}

/** « 3 000 FCFA » ; « — » sans prix (à négocier). */
export function formatFcfa(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—'
  return `${Math.round(value).toLocaleString('fr-FR')} FCFA`
}

/** Matières que le collecteur peut vendre (stock vérifié supérieur à zéro). */
export function sellable(stock: Record<Category, number>): Category[] {
  return (Object.keys(stock) as Category[]).filter((category) => stock[category] > 0)
}

/** Poids saisi valide : nombre positif, pas plus que le stock de la matière. */
export function weightProblem(raw: string, available: number): 'missing' | 'tooMuch' | null {
  const value = Number(raw.trim().replace(',', '.'))
  if (!raw.trim() || !Number.isFinite(value) || value <= 0) return 'missing'
  if (value > available + 1e-9) return 'tooMuch'
  return null
}

/** Lien d'appel ou de SMS vers le contact, s'il est visible. */
export function telLink(phone: string | null | undefined): string | null {
  return phone ? `tel:${phone}` : null
}

export function isOpen(lot: Pick<Lot, 'status'>): boolean {
  return lot.status === 'available' || lot.status === 'reserved'
}
