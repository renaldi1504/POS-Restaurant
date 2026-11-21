import type { ReactNode } from 'react';
import { cn } from './cn';

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

/** Header putih sticky dengan tombol kembali 48px. */
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
    <header
      className={cn(
        'sticky top-0 z-20 flex flex-col gap-2.5 border-b border-line bg-white px-3.5 py-2.5',
        className,
      )}
    >
      <div className="flex items-center gap-2.5">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            aria-label={backLabel}
            className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-line-strong bg-white shadow-card"
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="m15 18-6-6 6-6" />
            </svg>
          </button>
        ) : null}
        <div className="flex min-w-0 grow flex-col">
          <h1 className="truncate text-xl font-extrabold leading-tight">{title}</h1>
          {subtitle ? <span className="truncate text-[13px] text-muted">{subtitle}</span> : null}
        </div>
        {right}
      </div>
      {children}
    </header>
  );
}
