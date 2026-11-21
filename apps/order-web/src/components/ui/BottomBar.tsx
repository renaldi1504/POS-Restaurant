import type { ReactNode } from 'react';
import { cn } from './cn';

/** Bar aksi bawah (sticky) dengan safe-area iOS/Android. */
export function BottomBar({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'sticky bottom-0 z-20 flex flex-col gap-2 border-t border-line bg-white px-3.5 pt-3',
        'pb-[max(12px,env(safe-area-inset-bottom))]',
        className,
      )}
    >
      {children}
    </div>
  );
}
