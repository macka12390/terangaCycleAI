// Les 5 catégories de déchet du MVP (contrat d'API) : plastique, métal, papier et carton,
// verre, organique. Libellés par i18n (`waste.<code>`), couleurs par jetons
// `--color-waste-<code>` (theme.css).
import { CATEGORIES, type Category } from '../../api/types.ts'

export const WASTE_TYPES = CATEGORIES

export type WasteType = Category

/** Toucher l'option déjà choisie la retire : la catégorie du citoyen est facultative. */
export function toggleWasteType(current: WasteType | null, touched: WasteType): WasteType | null {
  return current === touched ? null : touched
}
