import type { HTMLAttributes } from 'react';
import { cn } from './cn';

export type BadgeTone = 'neutral' | 'primary' | 'secondary' | 'warn' | 'danger' | 'info' | 'dark';
const tones: Record<BadgeTone, string> = {
  neutral: 'bg-surface-container-highest text-on-surface-variant',
  primary: 'bg-primary-container text-on-primary-container',
  secondary: 'bg-secondary-container text-on-secondary-container',
  warn: 'bg-warning-container text-on-warning-container',
  danger: 'bg-error-container text-on-error-container',
  info: 'bg-tertiary-container text-on-tertiary-container',
  dark: 'bg-inverse-surface text-inverse-on-surface',
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
}

/** Label status kecil (role, status order, sumber) — warna peran M3, selalu dengan teks. */
export function Badge({ tone = 'neutral', className, ...rest }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex min-h-6 items-center gap-1 rounded-sm px-2 py-0.5 text-label-medium',
        tones[tone],
        className,
      )}
      {...rest}
    />
  );
}
