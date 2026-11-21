import type { ReactNode } from 'react';
import { cn } from './cn';

/** Area aksi bawah (sticky, surface-container) dengan safe-area iOS/Android. */
export function BottomBar({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'sticky bottom-0 z-20 flex flex-col gap-2 bg-surface-container px-4 pt-3',
        'pb-[max(12px,env(safe-area-inset-bottom))]',
        className,
      )}
    >
      {children}
    </div>
  );
}
