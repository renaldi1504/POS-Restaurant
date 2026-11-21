import type { HTMLAttributes } from 'react';
import { cn } from './cn';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  padded?: boolean;
  tone?: 'default' | 'warn' | 'info' | 'danger' | 'primary';
}

const tones = {
  default: 'bg-white border-line',
  warn: 'bg-warn-tint border-warn',
  info: 'bg-info-tint border-info',
  danger: 'bg-danger-tint border-danger',
  primary: 'bg-primary-tint border-primary',
};

/** Kartu putih radius 16px dengan bayangan halus (SPEC). */
export function Card({ padded = true, tone = 'default', className, ...rest }: CardProps) {
  return (
    <div
      className={cn('rounded-card border shadow-card', tones[tone], padded && 'p-4', className)}
      {...rest}
    />
  );
}
