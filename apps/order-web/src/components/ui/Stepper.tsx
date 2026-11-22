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
  /** aria-label tombol − / + (default "Kurangi {label}" / "Tambah {label}"). */
  decLabel?: string;
  incLabel?: string;
}

/** Stepper − n + dalam satu pil (tombol 48/56 px, + terisi primary). Nilai di bawah `min` tidak bisa dipilih. */
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
  const btn = cn(
    'state-layer flex shrink-0 items-center justify-center rounded-full disabled:opacity-38',
    size === 'lg' ? 'size-14' : 'size-12',
  );
  return (
    <div
      className="inline-flex shrink-0 items-center gap-1 rounded-full bg-surface-container-high"
      role="group"
      aria-label={label}
    >
      <button
        type="button"
        className={cn(btn, 'text-on-surface')}
        aria-label={decLabel ?? `Kurangi ${label}`}
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
      >
        <Icon name="remove" size={size === 'lg' ? 28 : 24} />
      </button>
      <span
        className={cn(
          'min-w-7 text-center font-bold tabular-nums',
          size === 'lg' ? 'text-headline-small' : 'text-title-medium',
        )}
        aria-live="polite"
      >
        {value}
      </span>
      <button
        type="button"
        className={cn(btn, 'bg-primary text-on-primary shadow-e1 disabled:shadow-none')}
        aria-label={incLabel ?? `Tambah ${label}`}
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
      >
        <Icon name="add" size={size === 'lg' ? 28 : 24} />
      </button>
    </div>
  );
}
