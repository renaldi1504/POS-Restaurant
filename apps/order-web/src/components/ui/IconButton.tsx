import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from './cn';
import { Icon, type IconName } from './Icon';

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Wajib untuk aksesibilitas (tombol ikon). */
  label: string;
  /** Nama Material Symbol (atau elemen ikon lain lewat children). */
  icon?: IconName;
  children?: ReactNode;
  /** Angka di badge (mis. order online baru). */
  badge?: number;
  /** standard = tanpa wadah, tonal/filled/outlined = varian M3; warn = tonal kuning (perhatian). */
  variant?: 'standard' | 'tonal' | 'filled' | 'outlined';
  tone?: 'default' | 'warn';
  selected?: boolean;
}

const variants = {
  standard: 'text-on-surface-variant',
  tonal: 'bg-secondary-container text-on-secondary-container',
  filled: 'bg-primary text-on-primary',
  outlined: 'border border-outline text-on-surface-variant',
};

/** Tombol ikon M3 48×48 dengan aria-label & badge opsional (mis. bel order online). */
export function IconButton({
  label,
  icon,
  children,
  badge,
  variant = 'standard',
  tone = 'default',
  selected,
  className,
  type = 'button',
  ...rest
}: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        'state-layer relative inline-flex size-12 shrink-0 items-center justify-center rounded-full disabled:opacity-38',
        tone === 'warn' ? 'bg-warning-container text-on-warning-container' : variants[variant],
        className,
      )}
      {...rest}
    >
      {icon ? <Icon name={icon} filled={selected} /> : children}
      {badge ? <CountBadge count={badge} className="absolute right-0.5 top-0.5" /> : null}
    </button>
  );
}

/** Badge angka M3 (merah) untuk ikon/nav. */
export function CountBadge({ count, className }: { count: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'pointer-events-none flex h-[22px] min-w-[22px] items-center justify-center rounded-full bg-error px-1.5 text-label-medium tabular-nums text-on-error',
        className,
      )}
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}
