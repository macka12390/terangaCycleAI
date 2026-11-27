import { Camera, ImageUp, Loader2 } from 'lucide-react'
import { useRef, type ChangeEvent } from 'react'
import { useTranslation } from 'react-i18next'

// Choix d'une photo en deux boutons (cahier des charges : « prendre ou sélectionner ») :
// l'appareil photo arrière, ou une image déjà sur le téléphone. Le fichier choisi est
// remis à `onFile` ; l'allègement et le retrait des métadonnées se font ensuite.

export function PhotoPicker({
  onFile,
  busy = false,
  cameraLabel,
}: {
  onFile: (file: File) => void
  busy?: boolean
  /** Libellé du bouton appareil photo (par défaut « Prendre une photo »). */
  cameraLabel?: string
}) {
  const { t } = useTranslation()
  const camera = useRef<HTMLInputElement>(null)
  const gallery = useRef<HTMLInputElement>(null)

  function picked(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    // Le même fichier pourra être choisi à nouveau.
    event.target.value = ''
    if (file) onFile(file)
  }

  const button =
    'flex min-h-24 flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-line bg-mint/40 p-4 font-bold text-brand-600 disabled:opacity-60'

  return (
    <div className="grid grid-cols-2 gap-3">
      <input
        ref={camera}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        tabIndex={-1}
        aria-hidden="true"
        data-testid="camera-input"
        onChange={picked}
      />
      <input
        ref={gallery}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        tabIndex={-1}
        aria-hidden="true"
        data-testid="gallery-input"
        onChange={picked}
      />
      <button type="button" disabled={busy} onClick={() => camera.current?.click()} className={button}>
        {busy ? (
          <Loader2 aria-hidden="true" className="size-8 animate-spin" />
        ) : (
          <Camera aria-hidden="true" className="size-8" />
        )}
        {busy ? t('capture.photo.processing') : (cameraLabel ?? t('photoPicker.camera'))}
      </button>
      <button type="button" disabled={busy} onClick={() => gallery.current?.click()} className={button}>
        <ImageUp aria-hidden="true" className="size-8" />
        {t('photoPicker.gallery')}
      </button>
    </div>
  )
}
