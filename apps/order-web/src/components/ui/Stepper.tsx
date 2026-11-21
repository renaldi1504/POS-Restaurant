import { cn } from './cn';

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

/** Stepper − n + dengan tombol besar. Nilai di bawah `min` tidak bisa dipilih. */
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
    'flex items-center justify-center rounded-xl font-extrabold disabled:opacity-40',
    size === 'lg' ? 'size-14 text-3xl' : 'size-12 text-2xl',
  );
  return (
    <div className="inline-flex items-center gap-2" role="group" aria-label={label}>
      <button
        type="button"
        className={cn(btn, 'border border-line-strong bg-white text-ink')}
        aria-label={decLabel ?? `Kurangi ${label}`}
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
      >
        −
      </button>
      <span
        className={cn(
          'min-w-8 text-center font-extrabold tabular-nums',
          size === 'lg' ? 'text-2xl' : 'text-xl',
        )}
        aria-live="polite"
      >
        {value}
      </span>
      <button
        type="button"
        className={cn(btn, 'bg-primary text-white')}
        aria-label={incLabel ?? `Tambah ${label}`}
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
      >
        +
      </button>
    </div>
  );
}
