import { Banknote, CircleUserRound, HandCoins, Loader2, LogOut, Recycle, Undo2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router'

import { listLots, payLot, releaseLot, reserveLot } from '../../api/endpoints.ts'
import { errorCode } from '../../api/http.ts'
import type { Category } from '../../api/types.ts'
import { PATHS } from '../../paths.ts'
import { DemoTag, Empty, ErrorMessage, Loading } from '../../ui/common.tsx'
import { useLoad } from '../../ui/load.ts'
import { WASTE_TYPES } from '../classify/wasteTypes.ts'
import { clearSession, getUser } from '../session/session.ts'
import { canPayLot } from '../payments/payments.ts'
import { LotCard } from './LotCard.tsx'
import { formatFcfa } from './lots.ts'

// Espace recycleur (étape 5) : lots de matière vérifiée, par matière ; réserver un lot donne
// le contact du collecteur pour organiser l'enlèvement.

const BUTTON = 'flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 font-bold disabled:opacity-50'

export function RecyclerLotsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const user = getUser()
  const [scope, setScope] = useState<'available' | 'mine'>('available')
  const [category, setCategory] = useState<Category | ''>('')
  const { load, reload } = useLoad(() => listLots({ scope, category: category || undefined }), [scope, category])
  const [busy, setBusy] = useState<number | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [failure, setFailure] = useState<string | null>(null)

  async function act(id: number, action: () => Promise<unknown>, message: string) {
    setBusy(id)
    setFailure(null)
    setNotice(null)
    try {
      await action()
      setNotice(message)
      reload()
    } catch (error) {
      setFailure(errorCode(error))
      reload()
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex min-h-dvh flex-col bg-surface">
      <header className="bg-brand-900 px-4 py-3 text-surface">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <span className="flex items-center gap-2 font-bold">
            <Recycle aria-hidden="true" className="size-6 text-accent" />
            {user?.name}
            {user?.is_demo && <DemoTag />}
          </span>
          <Link to={PATHS.account} className="ml-auto flex min-h-11 items-center gap-1 font-semibold text-mint">
            <CircleUserRound aria-hidden="true" className="size-5" />
            {/* Sur téléphone : icône seule, libellé gardé pour les lecteurs d'écran. */}
            <span className="sr-only sm:not-sr-only">{t('account.link')}</span>
          </Link>
          <button
            type="button"
            onClick={() => {
              clearSession()
              void navigate(PATHS.home, { replace: true })
            }}
            className="flex min-h-11 items-center gap-2 font-semibold text-mint"
          >
            <LogOut aria-hidden="true" className="size-5" />
            <span className="sr-only sm:not-sr-only">{t('admin.logout')}</span>
          </button>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 p-4">
        <h1 className="text-2xl font-bold text-brand-900">{t('lots.recycler.title')}</h1>
        <p className="text-muted">{t('lots.recycler.intro')}</p>

        <div role="tablist" className="flex flex-wrap gap-2">
          {(['available', 'mine'] as const).map((value) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={scope === value}
              onClick={() => setScope(value)}
              className={`min-h-11 rounded-full px-4 font-semibold ${
                scope === value ? 'bg-brand-600 text-surface' : 'border-2 border-line text-ink'
              }`}
            >
              {t(`lots.recycler.tabs.${value}`)}
            </button>
          ))}
          <label className="ml-auto flex items-center gap-2 text-sm font-semibold text-ink">
            {t('lots.category')}
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value as Category | '')}
              className="min-h-11 rounded-xl border-2 border-line bg-surface px-3"
            >
              <option value="">{t('lots.allCategories')}</option>
              {WASTE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {t(`waste.${type}`)}
                </option>
              ))}
            </select>
          </label>
        </div>

        {notice && <p role="status" className="rounded-xl bg-mint p-3 font-semibold text-brand-900">{notice}</p>}
        {failure && <ErrorMessage code={failure} />}
        {load.state === 'loading' && <Loading />}
        {load.state === 'error' && <ErrorMessage code={load.code} onRetry={reload} />}
        {load.state === 'ready' &&
          (load.data.length === 0 ? (
            <Empty>{t(`lots.recycler.empty.${scope}`)}</Empty>
          ) : (
            <ul className="flex flex-col gap-3">
              {load.data.map((lot) => (
                <LotCard
                  key={lot.id}
                  lot={lot}
                  actions={
                    lot.status === 'available' ? (
                      <button
                        type="button"
                        disabled={busy !== null}
                        onClick={() => void act(lot.id, () => reserveLot(lot.id), t('lots.recycler.reserved'))}
                        className={`${BUTTON} bg-brand-600 text-surface`}
                      >
                        {busy === lot.id ? <Loader2 aria-hidden="true" className="size-5 animate-spin" /> : <HandCoins aria-hidden="true" className="size-5" />}
                        {t('lots.recycler.reserve')}
                      </button>
                    ) : lot.recycler?.id === user?.id && (lot.status === 'reserved' || canPayLot(lot, user?.id)) ? (
                      <>
                      {canPayLot(lot, user?.id) && (
                        <button
                          type="button"
                          disabled={busy !== null}
                          onClick={() =>
                            void act(lot.id, async () => payLot(lot.id), t('payments.recycler.paid', { amount: formatFcfa(lot.total_price) }))
                          }
                          className={`${BUTTON} bg-brand-600 text-surface`}
                        >
                          {busy === lot.id ? <Loader2 aria-hidden="true" className="size-5 animate-spin" /> : <Banknote aria-hidden="true" className="size-5" />}
                          {t('payments.recycler.pay', { amount: formatFcfa(lot.total_price) })}
                        </button>
                      )}
                      {lot.status === 'reserved' && lot.payment?.status !== 'succeeded' && (
                      <button
                        type="button"
                        disabled={busy !== null}
                        onClick={() => void act(lot.id, () => releaseLot(lot.id), t('lots.recycler.released'))}
                        className={`${BUTTON} border-2 border-line text-ink`}
                      >
                        <Undo2 aria-hidden="true" className="size-5" />
                        {t('lots.recycler.release')}
                      </button>
                      )}
                      </>
                    ) : undefined
                  }
                />
              ))}
            </ul>
          ))}
      </main>
    </div>
  )
}
