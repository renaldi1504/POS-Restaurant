import type { ButtonHTMLAttributes } from 'react';
import { cn } from './cn';
import { Icon, type IconName } from './Icon';

export interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
  count?: number;
  /** Ikon depan saat tidak terpilih (saat terpilih diganti tanda centang). */
  icon?: IconName;
}

/** Chip filter M3 (tinggi 40px + area sentuh 48px, radius 8px); terpilih = secondary-container + centang. */
export function Chip({ active, count, icon, className, children, type = 'button', ...rest }: ChipProps) {
  return (
    <button
      type={type}
      aria-pressed={active}
      className={cn(
        'state-layer relative inline-flex h-10 shrink-0 items-center gap-1.5 rounded-sm text-label-large',
        'after:absolute after:inset-x-0 after:-inset-y-1 after:content-[""]',
        active
          ? 'bg-secondary-container pl-2 pr-4 text-on-secondary-container'
          : cn(
              'border border-outline-variant bg-surface-container-lowest pr-4 text-on-surface-variant',
              icon ? 'pl-2' : 'pl-4',
            ),
        className,
      )}
      {...rest}
    >
      {active ? <Icon name="check" size={18} /> : icon ? <Icon name={icon} size={18} /> : null}
      {children}
      {count !== undefined ? (
        <span className="text-label-medium tabular-nums opacity-80">{count}</span>
      ) : null}
    </button>
  );
}
