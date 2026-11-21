import { cn } from './cn';

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

/** Kontrol segmen (radio group) — mis. Makan sini / Bungkus / Delivery. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  size = 'lg',
}: SegmentedProps<T>) {
  return (
    <div role="radiogroup" aria-label={label} className="flex gap-1 rounded-[14px] bg-[#F2F4F7] p-1">
      {options.map((o) => {
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
              'flex-1 rounded-xl px-2 font-bold transition-colors disabled:opacity-40',
              size === 'lg' ? 'min-h-12 text-base' : 'min-h-11 text-[15px]',
              active ? 'bg-white text-ink shadow-card' : 'text-muted',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
