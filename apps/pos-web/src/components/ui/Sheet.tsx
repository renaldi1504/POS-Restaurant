import { useEffect, useId, useRef, type ReactNode } from 'react';
import { cn } from './cn';

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** 'bottom' = lembar dari bawah (HP), 'center' = dialog. */
  variant?: 'bottom' | 'center';
  closeLabel?: string;
}

/** Lembar bawah / modal dengan backdrop, Escape untuk tutup, fokus awal ke panel. */
export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
  variant = 'bottom',
  closeLabel = 'Tutup',
}: SheetProps) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    panel.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div
      className={cn(
        'fixed inset-0 z-50 flex bg-ink/50',
        variant === 'bottom' ? 'items-end' : 'items-center justify-center p-4',
      )}
      onClick={onClose}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          'mx-auto flex max-h-[92dvh] w-full max-w-[480px] flex-col bg-white outline-none',
          variant === 'bottom' ? 'rounded-t-[20px]' : 'rounded-[20px]',
        )}
      >
        <div className="flex items-center gap-2 border-b border-line px-4 py-3">
          <h2 id={titleId} className="grow text-lg font-extrabold">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={closeLabel}
            className="flex size-12 items-center justify-center rounded-xl text-muted hover:bg-bg"
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              aria-hidden
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="grow overflow-y-auto px-4 py-3">{children}</div>
        {footer ? (
          <div className="border-t border-line px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}
