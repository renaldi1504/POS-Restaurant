import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Sheet } from '../ui';
import { TextField } from './Form';

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
        <div className="flex gap-2">
          <Button variant="outline" className="w-28" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} className="grow" loading={loading} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      }
    >
      {message ? <div className="text-base text-ink">{message}</div> : null}
    </Sheet>
  );
}

/** Minta alasan (tolak / batal), opsional dengan pilihan cepat. */
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
          <Button variant="outline" className="w-28" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="danger"
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
              <button
                key={q}
                type="button"
                aria-pressed={reason === q}
                onClick={() => setReason(q)}
                className={
                  reason === q
                    ? 'min-h-11 rounded-xl border-2 border-danger bg-danger-tint px-3 font-bold'
                    : 'min-h-11 rounded-xl border border-line-strong bg-white px-3 font-semibold'
                }
              >
                {q}
              </button>
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
  const key = 'h-14 rounded-2xl border border-line-strong bg-white text-2xl font-bold shadow-card active:bg-bg';
  return (
    <div className="flex flex-col items-center gap-3">
      <div role="status" aria-label={t('auth.pinDots', { count: value.length })} className="flex h-6 items-center gap-4">
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className={i < value.length ? 'size-5 rounded-full bg-ink' : 'size-4 rounded-full border-[1.5px] border-[#98A2B3]'}
          />
        ))}
      </div>
      <div className="grid w-full grid-cols-3 gap-2">
        {keys.map((k) => (
          <button key={k} type="button" className={key} onClick={() => value.length < 4 && onChange(value + k)}>
            {k}
          </button>
        ))}
        <button type="button" className={`${key} text-base text-danger`} onClick={() => onChange(value.slice(0, -1))}>
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
