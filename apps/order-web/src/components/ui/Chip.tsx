import type { ButtonHTMLAttributes } from 'react';
import { cn } from './cn';

export interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
  count?: number;
}

/** Chip kategori (tinggi 40px, gelap saat aktif). */
export function Chip({ active, count, className, children, type = 'button', ...rest }: ChipProps) {
  return (
    <button
      type={type}
      aria-pressed={active}
      className={cn(
        'inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full px-4 text-[15px]',
        active
          ? 'bg-ink font-bold text-white'
          : 'border border-line-strong bg-white font-semibold text-ink shadow-card',
        className,
      )}
      {...rest}
    >
      {children}
      {count !== undefined ? (
        <span className={cn('text-[13px]', active ? 'text-white/70' : 'text-muted')}>{count}</span>
      ) : null}
    </button>
  );
}
