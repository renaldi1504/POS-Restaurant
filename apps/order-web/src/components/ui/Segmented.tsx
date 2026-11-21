import { cn } from './cn';
import { Icon } from './Icon';

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  disabled?: boolean;
}

export interface SegmentedProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  size?: 'md' | 'lg';
}

/** Tombol segmen M3 (radio group, 2–4 pilihan) — mis. Makan sini / Bungkus / Delivery. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  size = 'lg',
}: SegmentedProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="flex overflow-hidden rounded-full border border-outline"
    >
      {options.map((o, i) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={o.disabled}
            onClick={() => onChange(o.value)}
            className={cn(
              'state-layer flex min-w-0 flex-1 items-center justify-center gap-1 px-2 text-label-large transition-colors disabled:text-on-surface/38',
              size === 'lg' ? 'min-h-12' : 'min-h-12',
              i > 0 && 'border-l border-outline',
              active ? 'bg-secondary-container text-on-secondary-container' : 'text-on-surface',
            )}
          >
            {active ? <Icon name="check" size={18} /> : null}
            <span className="truncate">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
