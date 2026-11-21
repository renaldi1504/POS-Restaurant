import type { HTMLAttributes } from 'react';
import { cn } from './cn';

export type BadgeTone = 'neutral' | 'primary' | 'warn' | 'danger' | 'info' | 'dark';
const tones: Record<BadgeTone, string> = {
  neutral: 'bg-[#F2F4F7] text-[#344054]',
  primary: 'bg-primary-tint text-primary-dark',
  warn: 'bg-[#FEF0C7] text-warn-dark',
  danger: 'bg-danger-tint text-danger',
  info: 'bg-info-tint text-info-dark',
  dark: 'bg-ink text-white',
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
}

/** Label kecil (role, status, sumber order). */
export function Badge({ tone = 'neutral', className, ...rest }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-extrabold tracking-wide',
        tones[tone],
        className,
      )}
      {...rest}
    />
  );
}
