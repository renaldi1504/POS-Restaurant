import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from './cn';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'outline' | 'ghost' | 'warning';
/** md = 48px (minimal sentuh), lg = 56px (aksi utama), xl = 64px (bayar / masuk). */
export type ButtonSize = 'md' | 'lg' | 'xl';

const variants: Record<ButtonVariant, string> = {
  primary:
    'bg-primary text-white hover:bg-primary-dark active:bg-primary-dark disabled:bg-line-strong disabled:text-white',
  secondary: 'bg-primary-tint text-primary-dark border border-primary/30 hover:bg-primary-tint/70',
  danger: 'bg-danger text-white hover:bg-danger/90 disabled:bg-line-strong',
  outline: 'bg-white text-ink border border-line-strong shadow-card hover:bg-bg',
  ghost: 'bg-transparent text-ink hover:bg-ink/5',
  warning: 'bg-warn text-ink hover:bg-warn/90',
};
const sizes: Record<ButtonSize, string> = {
  md: 'min-h-12 px-4 text-base rounded-xl',
  lg: 'min-h-14 px-5 text-[17px] rounded-[14px]',
  xl: 'min-h-16 px-6 text-lg rounded-2xl',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  loading?: boolean;
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
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
        'inline-flex select-none items-center justify-center gap-2 font-extrabold transition-colors',
        'focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed',
        variants[variant],
        sizes[size],
        block && 'w-full',
        className,
      )}
      {...rest}
    >
      {loading ? (
        <span
          className="size-5 animate-spin rounded-full border-2 border-current border-t-transparent"
          aria-hidden
        />
      ) : (
        icon
      )}
      {children}
    </button>
  );
});
