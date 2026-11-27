import { CheckCheck, Loader2, PackagePlus, Trash2, Undo2 } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { cancelLot, createLot, handOverLot, listLots, lotStock, releaseLot } from '../../api/endpoints.ts'
import { errorCode } from '../../api/http.ts'
import type { Category } from '../../api/types.ts'
import { Empty, ErrorMessage, Loading } from '../../ui/common.tsx'
import { useLoad } from '../../ui/load.ts'
import { WasteTypeBadge } from '../classify/WasteTypePicker.tsx'
import { LotCard } from './LotCard.tsx'
import { formatKg, sellable, weightProblem } from './lots.ts'

// Mes lots (collecteur, étape 5) : stock vérifié par matière, mise en vente d'un lot,
// suivi des réservations et remise au recycleur.

const FIELD = 'min-h-11 rounded-xl border-2 border-line bg-surface px-3 text-ink focus:border-brand-600 focus:outline-none'
const BUTTON = 'flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 font-bold disabled:opacity-50'

export function CollectorLotsPage() {
  const { t } = useTranslation()
  const stock = useLoad(lotStock)
  const lots = useLoad(() => listLots())
  const [busy, setBusy] = useState<number | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [failure, setFailure] = useState<string | null>(null)

  function refresh() {
    stock.reload()
    lots.reload()
  }

  async function act(id: number, action: () => Promise<unknown>, message: string) {
    setBusy(id)
    setFailure(null)
    setNotice(null)
    try {
      await action()
      setNotice(message)
      refresh()
    } catch (error) {
      setFailure(errorCode(error))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold text-brand-900">{t('lots.collector.title')}</h1>
      <p className="text-muted">{t('lots.collector.intro')}</p>

      <section aria-labelledby="stock-title" className="flex flex-col gap-2">
        <h2 id="stock-title" className="font-bold text-ink">{t('lots.collector.stock')}</h2>
        {stock.load.state === 'loading' && <Loading />}
        {stock.load.state === 'error' && <ErrorMessage code={stock.load.code} onRetry={stock.reload} />}
        {stock.load.state === 'ready' &&
          (sellable(stock.load.data).length === 0 ? (
            <Empty>{t('lots.collector.noStock')}</Empty>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {sellable(stock.load.data).map((category) => (
                <li key={category} className="flex items-center gap-2 rounded-xl border border-line px-3 py-2">
                  <WasteTypeBadge type={category} />
                  <span className="font-bold text-ink">{formatKg(stock.load.state === 'ready' ? stock.load.data[category] : 0)}</span>
                </li>
              ))}
            </ul>
          ))}
      </section>

      {stock.load.state === 'ready' && sellable(stock.load.data).length > 0 && (
        <SellForm
          stock={stock.load.data}
          onSold={() => {
            setNotice(t('lots.collector.sold'))
            refresh()
          }}
        />
      )}

      {notice && <p role="status" className="rounded-xl bg-mint p-3 font-semibold text-brand-900">{notice}</p>}
      {failure && <ErrorMessage code={failure} />}

      <h2 className="font-bold text-ink">{t('lots.collector.mine')}</h2>
      {lots.load.state === 'loading' && <Loading />}
      {lots.load.state === 'error' && <ErrorMessage code={lots.load.code} onRetry={lots.reload} />}
      {lots.load.state === 'ready' &&
        (lots.load.data.length === 0 ? (
          <Empty>{t('lots.collector.empty')}</Empty>
        ) : (
          <ul className="flex flex-col gap-3">
            {lots.load.data.map((lot) => (
              <LotCard
                key={lot.id}
                lot={lot}
                actions={
                  lot.status === 'available' ? (
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() => void act(lot.id, () => cancelLot(lot.id), t('lots.collector.cancelled'))}
                      className={`${BUTTON} border-2 border-line text-ink`}
                    >
                      <Trash2 aria-hidden="true" className="size-5" />
                      {t('lots.collector.cancel')}
                    </button>
                  ) : lot.status === 'reserved' ? (
                    <>
                      <button
                        type="button"
                        disabled={busy !== null}
                        onClick={() => void act(lot.id, () => handOverLot(lot.id), t('lots.collector.handedOver'))}
                        className={`${BUTTON} bg-brand-600 text-surface`}
                      >
                        {busy === lot.id ? <Loader2 aria-hidden="true" className="size-5 animate-spin" /> : <CheckCheck aria-hidden="true" className="size-5" />}
                        {t('lots.collector.handOver')}
                      </button>
                      <button
                        type="button"
                        disabled={busy !== null}
                        onClick={() => void act(lot.id, () => releaseLot(lot.id), t('lots.collector.released'))}
                        className={`${BUTTON} border-2 border-line text-ink`}
                      >
                        <Undo2 aria-hidden="true" className="size-5" />
                        {t('lots.collector.release')}
                      </button>
                    </>
                  ) : undefined
                }
              />
            ))}
          </ul>
        ))}
    </div>
  )
}

function SellForm({ stock, onSold }: { stock: Record<Category, number>; onSold: () => void }) {
  const { t } = useTranslation()
  const options = sellable(stock)
  const [category, setCategory] = useState<Category>(options[0])
  const [weight, setWeight] = useState('')
  const [price, setPrice] = useState('')
  const [description, setDescription] = useState('')
  const [pending, setPending] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const available = stock[category] ?? 0
  const problem = weightProblem(weight, available)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (problem || pending) return
    setPending(true)
    setFailure(null)
    try {
      await createLot({
        category,
        weight_kg: Number(weight.replace(',', '.')),
        price_per_kg: price.trim() ? Number(price.replace(',', '.')) : undefined,
        description: description.trim() || undefined,
      })
      setWeight('')
      setPrice('')
      setDescription('')
      onSold()
    } catch (error) {
      setFailure(errorCode(error))
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-3 rounded-2xl border-2 border-brand-600 p-4" noValidate>
      <h2 className="flex items-center gap-2 font-bold text-brand-900">
        <PackagePlus aria-hidden="true" className="size-5" />
        {t('lots.collector.sellTitle')}
      </h2>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-sm font-semibold text-ink">
          {t('lots.category')}
          <select value={category} onChange={(event) => setCategory(event.target.value as Category)} className={FIELD}>
            {options.map((option) => (
              <option key={option} value={option}>
                {t(`waste.${option}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold text-ink">
          {t('lots.collector.weight', { max: formatKg(available) })}
          <input inputMode="decimal" value={weight} onChange={(event) => setWeight(event.target.value)} className={FIELD} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold text-ink">
          {t('lots.collector.pricePerKg')}
          <input inputMode="numeric" value={price} onChange={(event) => setPrice(event.target.value)} className={FIELD} />
        </label>
      </div>
      <label className="flex flex-col gap-1 text-sm font-semibold text-ink">
        {t('lots.collector.description')}
        <input value={description} maxLength={500} onChange={(event) => setDescription(event.target.value)} className={FIELD} />
      </label>
      {weight && problem === 'tooMuch' && (
        <p role="alert" className="text-sm font-semibold text-warning-ink">{t('lots.collector.tooMuch', { max: formatKg(available) })}</p>
      )}
      {failure && <ErrorMessage code={failure} />}
      <button type="submit" disabled={problem !== null || pending} className={`${BUTTON} self-start bg-brand-600 text-surface`}>
        {pending && <Loader2 aria-hidden="true" className="size-5 animate-spin" />}
        {t('lots.collector.sell')}
      </button>
    </form>
  )
}
