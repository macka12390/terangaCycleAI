import { MessageSquareText } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { listNotifications } from '../../api/endpoints.ts'
import type { NotificationStatus } from '../../api/types.ts'
import { Empty, ErrorMessage, Loading } from '../../ui/common.tsx'
import { formatDate, useLoad } from '../../ui/load.ts'
import { STATUS_STYLE, skipReason } from './notifications.ts'

// Journal des SMS (étape 4) : ce qui a été envoyé aux citoyens et aux collecteurs, numéros
// masqués. En mode test, aucun SMS ne part réellement : la page montre ce qui serait envoyé.

const FILTERS: (NotificationStatus | '')[] = ['', 'sent', 'skipped', 'failed', 'pending']

export function AdminNotificationsPage() {
  const { t } = useTranslation()
  const [status, setStatus] = useState<NotificationStatus | ''>('')
  const { load, reload } = useLoad(() => listNotifications(status || undefined), [status])

  return (
    <div className="flex flex-col gap-5">
      <h1 className="flex items-center gap-2 text-2xl font-bold text-brand-900">
        <MessageSquareText aria-hidden="true" className="size-6" />
        {t('admin.notifications.title')}
      </h1>
      <p className="text-muted">{t('admin.notifications.intro')}</p>
      {load.state === 'ready' && load.data.provider === 'console' && (
        <p className="rounded-2xl border-l-4 border-warning-ink bg-warning-bg p-4 font-semibold text-ink">
          {t('admin.notifications.testMode')}
        </p>
      )}
      <div role="tablist" className="flex flex-wrap gap-2">
        {FILTERS.map((value) => (
          <button
            key={value || 'all'}
            type="button"
            role="tab"
            aria-selected={status === value}
            onClick={() => setStatus(value)}
            className={`min-h-11 rounded-full px-4 font-semibold ${
              status === value ? 'bg-brand-600 text-white' : 'border-2 border-line text-ink'
            }`}
          >
            {t(`admin.notifications.filters.${value || 'all'}`)}
          </button>
        ))}
      </div>
      {load.state === 'loading' && <Loading />}
      {load.state === 'error' && <ErrorMessage code={load.code} onRetry={reload} />}
      {load.state === 'ready' &&
        (load.data.notifications.length === 0 ? (
          <Empty>{t('admin.notifications.empty')}</Empty>
        ) : (
          <ul className="flex flex-col gap-3">
            {load.data.notifications.map((notification) => {
              const reason = skipReason(notification)
              return (
                <li key={notification.id} className="flex flex-col gap-2 rounded-3xl border border-line bg-white p-5 shadow-card">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-bold text-ink">{notification.kind_label}</span>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${STATUS_STYLE[notification.status]}`}>
                      {t(`admin.notifications.statuses.${notification.status}`)}
                    </span>
                    {notification.tracking_number && (
                      <span className="font-mono text-muted">{notification.tracking_number}</span>
                    )}
                    <span className="ml-auto text-muted">{formatDate(notification.sent_at ?? notification.created_at)}</span>
                  </div>
                  <p className="text-sm text-ink">
                    {t('admin.notifications.to', {
                      name: notification.recipient?.name ?? '—',
                      phone: notification.phone ?? t('admin.notifications.noPhone'),
                    })}
                  </p>
                  <p className="rounded-xl bg-mint/60 p-3 text-ink">{notification.message}</p>
                  {reason && <p className="text-sm text-muted">{t(`admin.notifications.reasons.${reason}`)}</p>}
                </li>
              )
            })}
          </ul>
        ))}
    </div>
  )
}
