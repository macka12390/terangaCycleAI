import type { Report } from '../../api/types.ts'
import type { WasteType } from '../classify/wasteTypes.ts'

// Règle d'affichage de la modération : l'IA propose, l'humain décide (§3.3).

/** Catégorie préremplie : la meilleure connue d'après l'API (finale, sinon choix du
 *  citoyen, sinon suggestion IA à 60 % ou plus ; jamais une proposition plus faible). */
export function suggestedCategory(report: Report): WasteType | null {
  return report.final_category ?? report.citizen_category ?? report.ai?.suggested_category ?? null
}

/** Une catégorie peut encore être corrigée tant que les kilos ne sont pas vérifiés. */
export function canCorrect(report: Report): boolean {
  return report.status !== 'pending' && report.status !== 'rejected' && report.status !== 'completed'
}
