import { useTranslation } from 'react-i18next';
import { cn } from './cn';
import { Icon } from './Icon';

export interface StepperProps {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  /** Nama item untuk aria-label ("Kurangi Ayam Goreng"). */
  label: string;
  size?: 'md' | 'lg';
  /** aria-label tombol − / + (default kamus `formx.dec` / `formx.inc`). */
  decLabel?: string;
  incLabel?: string;
}

/** Stepper − n + : tombol ikon outlined & tonal besar. Nilai di bawah `min` tidak bisa dipilih. */
export function Stepper({
  value,
  onChange,
  min = 0,
  max = 99,
  label,
  size = 'md',
  decLabel,
  incLabel,
}: StepperProps) {
  const { t } = useTranslation();
  const btn = cn(
    'state-layer flex shrink-0 items-center justify-center rounded-full disabled:opacity-38',
    size === 'lg' ? 'size-14' : 'size-12',
  );
  return (
    <div className="inline-flex items-center gap-2" role="group" aria-label={label}>
      <button
        type="button"
        className={cn(btn, 'border border-outline text-on-surface-variant')}
        aria-label={decLabel ?? t('formx.dec', { label })}
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
      >
        <Icon name="remove" size={size === 'lg' ? 28 : 24} />
      </button>
      <span
        className={cn(
          'min-w-8 text-center tabular-nums',
          size === 'lg' ? 'text-headline-small' : 'text-title-large',
        )}
        aria-live="polite"
      >
        {value}
      </span>
      <button
        type="button"
        className={cn(btn, 'bg-primary text-on-primary')}
        aria-label={incLabel ?? t('formx.inc', { label })}
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
      >
        <Icon name="add" size={size === 'lg' ? 28 : 24} />
      </button>
    </div>
  );
}
