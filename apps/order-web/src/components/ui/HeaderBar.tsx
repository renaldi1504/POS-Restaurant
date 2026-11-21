import type { ReactNode } from 'react';
import { cn } from './cn';
import { IconButton } from './IconButton';

export interface HeaderBarProps {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Tampilkan tombol kembali. */
  onBack?: () => void;
  backLabel?: string;
  right?: ReactNode;
  className?: string;
  children?: ReactNode;
}

/** Top app bar kecil M3 (64px, title-large) dengan tombol kembali 48px. */
export function HeaderBar({
  title,
  subtitle,
  onBack,
  backLabel = 'Kembali',
  right,
  className,
  children,
}: HeaderBarProps) {
  return (
    <header className={cn('sticky top-0 z-20 flex flex-col gap-2 bg-surface px-1 pb-2', className)}>
      <div className="flex min-h-16 items-center gap-1">
        {onBack ? (
          <IconButton icon="arrow_back" label={backLabel} onClick={onBack} className="text-on-surface" />
        ) : (
          <span className="w-3 shrink-0" />
        )}
        <div className="flex min-w-0 grow flex-col px-1">
          <h1 className="truncate text-title-large">{title}</h1>
          {subtitle ? (
            <span className="truncate text-label-medium font-normal text-on-surface-variant">{subtitle}</span>
          ) : null}
        </div>
        {right ? <div className="flex shrink-0 items-center gap-1 pr-1">{right}</div> : null}
      </div>
      {children ? <div className="flex flex-col gap-2 px-3">{children}</div> : null}
    </header>
  );
}
