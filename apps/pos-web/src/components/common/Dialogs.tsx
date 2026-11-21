import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Chip, Icon, Sheet } from '../ui';
import { TextField } from './Form';

/** Dialog konfirmasi M3: judul, isi, tombol teks di kanan (destruktif = teks merah). */
export function ConfirmSheet({
  open,
  title,
  message,
  confirmLabel,
  danger,
  loading,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  message?: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      variant="center"
      closeLabel={t('common.close')}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="text" size="md" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            variant={danger ? 'text' : 'filled'}
            size="md"
            className={danger ? 'text-error' : undefined}
            loading={loading}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      }
    >
      {message ? <div className="text-body-large text-on-surface-variant">{message}</div> : null}
    </Sheet>
  );
}

/** Minta alasan (tolak / batal), opsional dengan chip pilihan cepat. */
export function ReasonSheet({
  open,
  title,
  label,
  confirmLabel,
  quick = [],
  loading,
  extra,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  label: string;
  confirmLabel: string;
  quick?: string[];
  loading?: boolean;
  extra?: ReactNode;
  onConfirm: (reason: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [reason, setReason] = useState('');
  useEffect(() => {
    if (open) setReason('');
  }, [open]);
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      closeLabel={t('common.close')}
      footer={
        <div className="flex gap-2">
          <Button variant="outlined" className="w-28" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="error"
            className="grow"
            disabled={!reason.trim()}
            loading={loading}
            onClick={() => onConfirm(reason.trim())}
          >
            {confirmLabel}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        {quick.length ? (
          <div className="flex flex-wrap gap-2">
            {quick.map((q) => (
              <Chip key={q} active={reason === q} onClick={() => setReason(q)}>
                {q}
              </Chip>
            ))}
          </div>
        ) : null}
        <TextField label={label} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />
        {extra}
      </div>
    </Sheet>
  );
}

/** Keypad PIN 4 digit (PIN admin untuk batal order yang sudah dibayar). */
export function PinPad({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t } = useTranslation();
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
  const key =
    'state-layer flex h-14 items-center justify-center rounded-full bg-surface-container-highest text-headline-small text-on-surface';
  return (
    <div className="flex flex-col items-center gap-3">
      <PinDots count={value.length} label={t('auth.pinDots', { count: value.length })} />
      <div className="grid w-full grid-cols-3 gap-2">
        {keys.map((k) => (
          <button
            key={k}
            type="button"
            className={key}
            onClick={() => value.length < 4 && onChange(value + k)}
          >
            {k}
          </button>
        ))}
        <button
          type="button"
          className={`${key} bg-transparent text-label-large text-error`}
          onClick={() => onChange(value.slice(0, -1))}
        >
          {t('auth.clear')}
        </button>
        <button type="button" className={key} onClick={() => value.length < 4 && onChange(value + '0')}>
          0
        </button>
        <span />
      </div>
    </div>
  );
}

/** Titik PIN (terisi = primary). */
export function PinDots({ count, label, total = 4 }: { count: number; label: string; total?: number }) {
  return (
    <div role="status" aria-label={label} className="flex h-6 items-center gap-4">
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={
            i < count
              ? 'size-5 rounded-full bg-primary transition-transform duration-200 ease-standard'
              : 'size-4 rounded-full border-2 border-outline'
          }
        />
      ))}
    </div>
  );
}

/** Banner info/peringatan M3 (wadah berwarna + ikon + teks). */
export function Banner({
  tone = 'info',
  children,
  action,
}: {
  tone?: 'info' | 'warn' | 'error' | 'success';
  children: ReactNode;
  action?: ReactNode;
}) {
  const cls = {
    info: 'bg-tertiary-container text-on-tertiary-container',
    warn: 'bg-warning-container text-on-warning-container',
    error: 'bg-error-container text-on-error-container',
    success: 'bg-primary-container text-on-primary-container',
  }[tone];
  const icon = ({ info: 'info', warn: 'warning', error: 'error', success: 'check_circle' } as const)[tone];
  return (
    <div className={`flex items-start gap-3 rounded-md px-4 py-3 text-body-medium ${cls}`}>
      <Icon name={icon} className="mt-px" />
      <div className="min-w-0 grow">{children}</div>
      {action}
    </div>
  );
}
