import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from './cn';

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Wajib untuk aksesibilitas (tombol ikon). */
  label: string;
  children: ReactNode;
  badge?: number;
  tone?: 'default' | 'warn';
}

/** Tombol ikon 48×48 dengan aria-label & badge opsional (mis. bel order online). */
export function IconButton({
  label,
  children,
  badge,
  tone = 'default',
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
        'relative inline-flex size-12 shrink-0 items-center justify-center rounded-xl text-ink',
        tone === 'warn'
          ? 'border-2 border-warn bg-warn-tint'
          : 'border border-line-strong bg-white shadow-card',
        className,
      )}
      {...rest}
    >
      {children}
      {badge ? (
        <span className="absolute -right-2 -top-2 flex h-6 min-w-6 items-center justify-center rounded-full bg-[#D92D20] px-1 text-[13px] font-extrabold text-white">
          {badge}
        </span>
      ) : null}
    </button>
  );
}
