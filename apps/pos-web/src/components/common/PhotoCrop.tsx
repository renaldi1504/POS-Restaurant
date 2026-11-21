/**
 * Pilih/ambil foto → lembar potong layar penuh (rasio tetap) → kecilkan (maks 1200px) → File siap upload.
 * Dipakai untuk foto menu (4:3, sama dengan kartu menu kasir & order-web) dan logo restoran (1:1).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import Cropper, { type Area } from 'react-easy-crop';
import { useTranslation } from 'react-i18next';
import { Button, useToast } from '../ui';
import { blobToFile, cropToBlob, loadImage } from '../../lib/crop';
import { errorMessage } from '../../lib/api';

export const MENU_PHOTO_ASPECT = 4 / 3;

export function PhotoCropSheet({
  src,
  aspect,
  onCancel,
  onDone,
  round,
}: {
  src: string;
  aspect: number;
  onCancel: () => void;
  onDone: (file: File, previewUrl: string) => void;
  round?: boolean;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [area, setArea] = useState<Area | null>(null);
  const [busy, setBusy] = useState(false);
  const onComplete = useCallback((_a: Area, px: Area) => setArea(px), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);
  const use = async () => {
    if (!area) return;
    setBusy(true);
    try {
      const img = await loadImage(src);
      const { blob } = await cropToBlob(img, area, { maxWidth: 1200, quality: 0.85 });
      onDone(blobToFile(blob, 'foto'), URL.createObjectURL(blob));
    } catch (e) {
      toast.error(errorMessage(e, t));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('crop.title')}
      className="fixed inset-0 z-[70] flex flex-col bg-inverse-surface text-inverse-on-surface"
    >
      <div className="flex min-h-16 shrink-0 items-center justify-between gap-3 px-4">
        <h2 className="text-title-large">{t('crop.title')}</h2>
        <span className="text-label-medium font-normal text-inverse-on-surface/80">{t('crop.hint')}</span>
      </div>
      <div className="relative min-h-0 grow bg-black" data-testid="crop-area">
        <Cropper
          image={src}
          crop={crop}
          zoom={zoom}
          minZoom={1}
          maxZoom={4}
          aspect={aspect}
          cropShape={round ? 'round' : 'rect'}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={onComplete}
          showGrid
        />
      </div>
      <div className="flex shrink-0 flex-col gap-3 bg-inverse-surface px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-3">
        <label className="flex items-center gap-3 text-label-large">
          <span>{t('crop.zoom')}</span>
          <input
            type="range"
            min={1}
            max={4}
            step={0.05}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="h-8 grow accent-inverse-primary"
            aria-label={t('crop.zoom')}
          />
        </label>
        <div className="flex gap-2.5">
          <Button
            variant="outlined"
            size="xl"
            className="w-32 border-inverse-on-surface/60 text-inverse-on-surface"
            onClick={onCancel}
          >
            {t('common.cancel')}
          </Button>
          <Button
            size="xl"
            className="grow bg-inverse-primary text-on-primary-container"
            loading={busy}
            disabled={!area}
            onClick={() => void use()}
          >
            {t('crop.use')}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Tombol + input file + lembar potong. `children(open)` menggambar tombol pemicu. */
export function usePhotoPicker(
  aspect: number,
  onPicked: (file: File, previewUrl: string) => void,
  opts: { round?: boolean } = {},
) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [src, setSrc] = useState<string | null>(null);
  const close = useCallback(() => {
    setSrc((s) => {
      if (s) URL.revokeObjectURL(s);
      return null;
    });
  }, []);
  const element = (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        aria-label={t('crop.pick')}
        data-testid="photo-input"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) setSrc(URL.createObjectURL(f));
        }}
      />
      {src ? (
        <PhotoCropSheet
          src={src}
          aspect={aspect}
          round={opts.round}
          onCancel={close}
          onDone={(file, url) => {
            close();
            onPicked(file, url);
          }}
        />
      ) : null}
    </>
  );
  return { open: () => inputRef.current?.click(), element };
}
