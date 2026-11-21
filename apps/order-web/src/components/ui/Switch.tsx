import type { ReactNode } from 'react';
import { cn } from './cn';
import { Icon } from './Icon';

/** Saklar M3 (track 52×32, ikon centang di thumb saat aktif) dengan label & keterangan. */
export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled,
  className,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn('flex min-h-14 w-full items-center gap-4 text-left disabled:opacity-38', className)}
    >
      <span className="flex min-w-0 grow flex-col">
        <span className="text-body-large">{label}</span>
        {description ? <span className="text-body-medium text-on-surface-variant">{description}</span> : null}
      </span>
      <SwitchTrack checked={checked} />
    </button>
  );
}

/** Hanya gambar saklar (untuk dipakai di dalam tombol lain). */
export function SwitchTrack({ checked }: { checked: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        'flex h-8 w-[52px] shrink-0 items-center rounded-full border-2 transition-colors duration-200 ease-standard',
        checked
          ? 'justify-end border-primary bg-primary px-1'
          : 'justify-start border-outline bg-surface-container-highest px-1.5',
      )}
    >
      <span
        className={cn(
          'flex items-center justify-center rounded-full transition-all duration-200 ease-standard',
          checked ? 'size-6 bg-on-primary text-primary' : 'size-4 bg-outline',
        )}
      >
        {checked ? <Icon name="check" size={16} /> : null}
      </span>
    </span>
  );
}
