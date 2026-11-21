import { useEffect, useId, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from './cn';
import { IconButton } from './IconButton';

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** 'bottom' = bottom sheet modal M3 (HP), 'center' = dialog M3. */
  variant?: 'bottom' | 'center';
  closeLabel?: string;
  /** Di tablet (≥600px) lembar bawah menjadi dialog di tengah (default) atau side sheet kanan. */
  tablet?: 'dialog' | 'side';
}

/** Bottom sheet / dialog M3: scrim, surface-container-high, radius 28px, Escape menutup, fokus ke panel. */
export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
  variant = 'bottom',
  closeLabel,
  tablet = 'dialog',
}: SheetProps) {
  const { t } = useTranslation();
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
  const bottom = variant === 'bottom';
  return (
    <div
      className={cn(
        'fixed inset-0 z-50 flex animate-fade-in bg-scrim',
        bottom
          ? cn(
              'items-end',
              tablet === 'side'
                ? 'medium:items-stretch medium:justify-end'
                : 'medium:items-center medium:justify-center medium:p-6',
            )
          : 'items-center justify-center p-6',
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
          'mx-auto flex max-h-[92dvh] w-full flex-col bg-surface-container-high text-on-surface shadow-e1 outline-none',
          bottom
            ? cn(
                'max-w-[560px] animate-sheet-up rounded-t-xl',
                tablet === 'side'
                  ? 'medium:mx-0 medium:h-full medium:max-h-none medium:w-[420px] medium:animate-fade-in medium:rounded-none medium:rounded-l-xl'
                  : 'medium:animate-fade-in medium:rounded-xl',
              )
            : 'max-w-[480px] rounded-xl',
        )}
      >
        {bottom ? (
          <div className="flex justify-center pb-1 pt-4 medium:hidden" aria-hidden>
            <span className="h-1 w-8 rounded-full bg-on-surface-variant/40" />
          </div>
        ) : null}
        <div className={cn('flex items-center gap-2 pl-6 pr-2', bottom ? 'py-1 medium:pt-4' : 'pb-2 pt-4')}>
          <h2 id={titleId} className={cn('grow', bottom ? 'text-title-large' : 'text-headline-small')}>
            {title}
          </h2>
          <IconButton icon="close" label={closeLabel ?? t('common.close')} onClick={onClose} />
        </div>
        <div className="grow overflow-y-auto px-6 pb-4 pt-2">{children}</div>
        {footer ? (
          <div className={cn('px-6 pt-2', bottom ? 'pb-[max(16px,env(safe-area-inset-bottom))]' : 'pb-6')}>
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}
