import type { ReactNode } from 'react';
import { cn } from './cn';

/** Area aksi bawah (sticky, putih membulat dengan bayangan ke atas) dengan safe-area iOS/Android. */
export function BottomBar({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'sticky bottom-0 z-20 flex flex-col gap-2 rounded-t-2xl bg-surface-container-lowest px-4 pt-4 shadow-up',
        'pb-[max(12px,env(safe-area-inset-bottom))]',
        className,
      )}
    >
      {children}
    </div>
  );
}
