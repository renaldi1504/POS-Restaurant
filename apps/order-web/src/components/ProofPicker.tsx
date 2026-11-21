/** Pilih foto bukti transfer ABA: kompres di perangkat, pratinjau, ganti/hapus. */
import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MAX_UPLOAD_BYTES } from '@pos/shared';
import { compressImage } from '../lib/image';
import { CameraIcon } from './Icons';
import { Button } from './ui';

export function ProofPicker({ value, onChange }: { value: File | null; onChange: (f: File | null) => void }) {
  const { t } = useTranslation();
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!value || typeof URL.createObjectURL !== 'function') {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(value);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [value]);

  const onPick = async (file: File | undefined) => {
    setError(null);
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError(t('web.proofNotImage'));
      return;
    }
    setBusy(true);
    const out = await compressImage(file);
    setBusy(false);
    if (out.size > MAX_UPLOAD_BYTES) {
      setError(t('web.proofTooLarge'));
      return;
    }
    onChange(out);
  };

  return (
    <div className="flex flex-col gap-2" data-testid="proof-picker">
      <input
        ref={input}
        id={inputId}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(e) => {
          void onPick(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      {value ? (
        <div className="flex flex-col gap-2">
          {preview ? (
            <img
              src={preview}
              alt={t('web.proofPreview')}
              className="max-h-64 w-full rounded-xl border border-line object-contain bg-white"
            />
          ) : (
            <p className="text-sm font-semibold">{value.name}</p>
          )}
          <div className="flex gap-2">
            <Button variant="outline" size="md" className="grow" onClick={() => input.current?.click()}>
              {t('web.changePhoto')}
            </Button>
            <Button variant="ghost" size="md" className="text-danger" onClick={() => onChange(null)}>
              {t('web.removePhoto')}
            </Button>
          </div>
        </div>
      ) : (
        <label
          htmlFor={inputId}
          className="flex min-h-14 cursor-pointer items-center justify-center gap-2 rounded-[14px] border-2 border-dashed border-primary bg-white text-base font-extrabold text-primary-dark"
          aria-busy={busy || undefined}
        >
          <CameraIcon />
          {busy ? t('common.loading') : t('order.uploadProof')}
        </label>
      )}
      {error ? (
        <p role="alert" className="text-sm font-bold text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
