import { Sparkles } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import type { Ai } from '../../api/types.ts'
import { WasteTypeBadge } from './WasteTypePicker.tsx'

/** Proposition de l'IA : catégorie, confiance et libellé (d'où vient la proposition).
 *  Sans IA active (`manual`), le dit clairement : jamais de fausse prédiction. */
export function AiPanel({ ai }: { ai: Ai }) {
  const { t } = useTranslation()
  if (ai.mode === 'manual' || ai.category === null) {
    return <p className="text-sm text-ink">{t('citizen.ai.manual')}</p>
  }
  const confidence = ai.confidence === null ? null : Math.round(ai.confidence * 100)
  return (
    <div className="flex flex-col gap-2">
      <p className="flex flex-wrap items-center justify-between gap-2">
        <WasteTypeBadge type={ai.category} />
        {confidence !== null && (
          <span className="text-sm text-muted">{t('citizen.ai.confidence', { value: confidence })}</span>
        )}
      </p>
      <p className="flex items-start gap-2 rounded-lg bg-warning-bg px-2 py-1 text-xs font-semibold text-warning-ink">
        <Sparkles aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
        {ai.label}
      </p>
      {ai.suggested_category === null && (
        <p className="text-xs text-muted">{t('citizen.ai.lowConfidence')}</p>
      )}
    </div>
  )
}
