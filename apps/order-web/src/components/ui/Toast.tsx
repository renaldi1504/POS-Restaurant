import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { cn } from './cn';
import { Icon } from './Icon';

export type ToastTone = 'success' | 'error' | 'info';
interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
}
interface ToastApi {
  show: (message: string, tone?: ToastTone, ms?: number) => void;
  success: (message: string) => void;
  error: (message: string) => void;
}

const ToastCtx = createContext<ToastApi | null>(null);

const toneIcon = {
  success: <Icon name="check_circle" className="text-inverse-primary" />,
  error: <Icon name="error" className="text-error-container" />,
  info: null,
};

/**
 * Snackbar M3 (inverse-surface, di bawah, di atas navigation bar). Tidak menangkap ketukan sehingga tombol
 * di bawahnya tetap bisa dipakai. `const toast = useToast(); toast.success('Tersimpan')`.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);
  const show = useCallback((message: string, tone: ToastTone = 'info', ms = 4000) => {
    const id = ++seq.current;
    setItems((xs) => [...xs, { id, message, tone }]);
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), ms);
  }, []);
  const api = useMemo<ToastApi>(
    () => ({ show, success: (m) => show(m, 'success'), error: (m) => show(m, 'error', 6000) }),
    [show],
  );
  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-[calc(160px+env(safe-area-inset-bottom))] z-[60] flex flex-col items-center gap-2 px-4"
        aria-live="assertive"
      >
        {items.map((t) => (
          <div
            key={t.id}
            role="status"
            data-tone={t.tone}
            className={cn(
              'flex min-h-12 w-full max-w-[480px] animate-rise items-center gap-3 rounded-2xl bg-inverse-surface px-4 py-3 text-body-medium text-inverse-on-surface shadow-e3',
            )}
          >
            {toneIcon[t.tone]}
            <span className="grow">{t.message}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error('useToast harus di dalam <ToastProvider>');
  return ctx;
}
