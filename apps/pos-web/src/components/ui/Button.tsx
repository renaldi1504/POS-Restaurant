import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from './cn';
import { Icon, type IconName } from './Icon';

/**
 * Tombol M3. filled = aksi utama (satu per layar), tonal = sekunder, outlined / text = ringan,
 * error = konfirmasi destruktif, warning = perhatian (tonal kuning), elevated = jarang.
 */
export type ButtonVariant = 'filled' | 'tonal' | 'outlined' | 'text' | 'elevated' | 'error' | 'warning';
/** md = 48px (minimal sentuh), lg = 56px (aksi utama bawah), xl = 64px (bayar / masuk). */
export type ButtonSize = 'md' | 'lg' | 'xl';

const variants: Record<ButtonVariant, string> = {
  filled:
    'bg-primary text-on-primary disabled:bg-on-surface/12 disabled:text-on-surface/38 enabled:hover:shadow-e1',
  tonal:
    'bg-secondary-container text-on-secondary-container disabled:bg-on-surface/12 disabled:text-on-surface/38',
  outlined:
    'border border-outline bg-transparent text-primary disabled:border-on-surface/12 disabled:text-on-surface/38',
  text: 'bg-transparent text-primary disabled:text-on-surface/38',
  elevated:
    'bg-surface-container-low text-primary shadow-e1 disabled:bg-on-surface/12 disabled:text-on-surface/38 disabled:shadow-none',
  error: 'bg-error text-on-error disabled:bg-on-surface/12 disabled:text-on-surface/38',
  warning:
    'bg-warning-container text-on-warning-container disabled:bg-on-surface/12 disabled:text-on-surface/38',
};
const sizes: Record<ButtonSize, string> = {
  md: 'min-h-12 px-6 text-label-large',
  lg: 'min-h-14 px-6 text-title-medium',
  xl: 'min-h-16 px-8 text-title-medium',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  loading?: boolean;
  /** Ikon di depan label: nama Material Symbol atau elemen. */
  icon?: IconName | ReactNode;
}

/** Indikator progres melingkar kecil (dipakai di tombol saat mengirim). */
export function CircularProgress({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'size-5 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent',
        className,
      )}
      aria-hidden
    />
  );
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'filled',
    size = 'lg',
    block,
    loading,
    icon,
    className,
    children,
    disabled,
    type = 'button',
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'state-layer inline-flex select-none items-center justify-center gap-2 rounded-full transition-[background-color,box-shadow] duration-200 ease-standard disabled:cursor-not-allowed',
        variants[variant],
        sizes[size],
        block && 'w-full',
        className,
      )}
      {...rest}
    >
      {loading ? (
        <CircularProgress />
      ) : typeof icon === 'string' ? (
        <Icon name={icon as IconName} size={size === 'md' ? 20 : 24} />
      ) : (
        icon
      )}
      {children}
    </button>
  );
});
