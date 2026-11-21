import type { HTMLAttributes } from 'react';
import { cn } from './cn';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  padded?: boolean;
  /** M3: outlined (default, grup daftar), filled (ringkasan), elevated (kartu yang bisa diketuk). */
  variant?: 'outlined' | 'filled' | 'elevated';
  /** Wadah berwarna untuk pesan status. */
  tone?: 'default' | 'warn' | 'info' | 'danger' | 'primary';
}

const variants = {
  outlined: 'border border-outline-variant bg-surface-container-lowest',
  filled: 'bg-surface-container-highest',
  elevated: 'bg-surface-container-lowest shadow-e1',
};
const tones = {
  warn: 'bg-warning-container text-on-warning-container',
  info: 'bg-tertiary-container text-on-tertiary-container',
  danger: 'bg-error-container text-on-error-container',
  primary: 'bg-primary-container text-on-primary-container',
};

/** Kartu M3 (radius 12px). */
export function Card({
  padded = true,
  variant = 'outlined',
  tone = 'default',
  className,
  ...rest
}: CardProps) {
  return (
    <div
      className={cn(
        'rounded-md',
        tone === 'default' ? variants[variant] : tones[tone],
        padded && 'p-4',
        className,
      )}
      {...rest}
    />
  );
}
