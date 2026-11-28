import { ChevronLeft, Download, Share2, Smartphone } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import { PATHS } from '../../paths.ts'
import { Logo } from '../../ui/Logo.tsx'

// QR code d'accès direct au signalement (modèle SenAlerte). Généré dans le navigateur :
// aucune adresse envoyée à un service tiers. À afficher pendant la démo ou à imprimer.

export function QrCodePage() {
  const { t } = useTranslation()
  const url = `${window.location.origin}${PATHS.citizenReport}`
  const svgRef = useRef<SVGSVGElement>(null)
  const [copied, setCopied] = useState(false)

  function download() {
    const svg = svgRef.current
    if (!svg) return
    const blob = new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = 'terangacycle-signalement-qr.svg'
    link.click()
    URL.revokeObjectURL(link.href)
  }

  async function share() {
    if (navigator.share) {
      try {
        await navigator.share({ title: 'TerangaCycle AI', text: t('citizen.qr.shareText'), url })
      } catch {
        // Partage annulé : rien à faire.
      }
      return
    }
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-gradient-to-br from-brand-600 to-brand-900 p-4">
      <div className="w-full max-w-lg overflow-hidden rounded-3xl bg-surface shadow-2xl">
        <div className="bg-gradient-to-r from-brand-900 to-brand-600 p-8 text-center text-surface">
          <Logo className="mx-auto mb-4 size-20 rounded-3xl" />
          <h1 className="text-3xl font-bold">{t('citizen.qr.title')}</h1>
          <p className="mt-1 text-mint">{t('citizen.qr.subtitle')}</p>
        </div>

        <div className="flex flex-col gap-6 p-8">
          <p className="inline-flex items-center gap-2 self-center rounded-full bg-mint px-4 py-2 text-sm font-bold text-brand-900">
            <Smartphone aria-hidden="true" className="size-4" />
            {t('citizen.qr.noAccount')}
          </p>
          <div className="self-center rounded-2xl border-4 border-mint bg-white p-5">
            <QRCodeSVG
              ref={svgRef}
              value={url}
              size={240}
              level="M"
              marginSize={2}
              title={t('citizen.qr.alt')}
            />
          </div>
          <code className="rounded-lg border border-line p-3 text-center text-sm break-all text-ink">
            {url}
          </code>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={download}
              className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-brand-600 font-bold text-surface"
            >
              <Download aria-hidden="true" className="size-5" />
              {t('citizen.qr.download')}
            </button>
            <button
              type="button"
              onClick={() => void share()}
              className="flex min-h-12 items-center justify-center gap-2 rounded-xl border-2 border-brand-600 font-bold text-brand-600"
            >
              <Share2 aria-hidden="true" className="size-5" />
              {t(copied ? 'citizen.qr.copied' : 'citizen.qr.share')}
            </button>
          </div>
          <Link
            to={PATHS.citizenReport}
            className="flex min-h-11 items-center justify-center gap-1 font-bold text-brand-600"
          >
            <ChevronLeft aria-hidden="true" className="size-5" />
            {t('citizen.qr.toReport')}
          </Link>
        </div>
      </div>
    </div>
  )
}
