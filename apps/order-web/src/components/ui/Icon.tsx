import type { IconName } from '@pos/shared/icons';
import { cn } from './cn';

export type { IconName };

export interface IconProps {
  name: IconName;
  /** Isi penuh (FILL 1) — dipakai untuk item terpilih (nav aktif, bintang). */
  filled?: boolean;
  /** Ukuran px (default 24, optical size 24). */
  size?: number;
  className?: string;
  /** Label untuk pembaca layar bila ikon berdiri sendiri; tanpa label ikon disembunyikan (dekoratif). */
  label?: string;
}

/** Ikon Material Symbols Rounded (font subset self-host, lihat packages/shared/src/icons.ts). */
export function Icon({ name, filled, size, className, label }: IconProps) {
  return (
    <span
      className={cn('material-symbol', className)}
      data-filled={filled ? '' : undefined}
      data-icon={name}
      style={size ? { fontSize: size } : undefined}
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
    />
  );
}
