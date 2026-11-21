/** Pengganti src/lib/socket.ts di test: tanpa koneksi; `emitSocket()` memicu handler. */
import { useEffect, useRef } from 'react';
import { vi } from 'vitest';

type Handler = (...args: unknown[]) => void;
const handlers = new Map<string, Set<Handler>>();

export function emitSocket(event: string, payload: unknown) {
  handlers.get(event)?.forEach((h) => h(payload));
}

export const getSocket = vi.fn(() => ({}));
export const reconnectSocket = vi.fn();
export function useSocketStatus() {
  return { connected: false };
}
export function useSocketEvent(event: string, handler: Handler, enabled = true) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    if (!enabled) return;
    const fn: Handler = (...a) => ref.current(...a);
    const set = handlers.get(event) ?? new Set();
    set.add(fn);
    handlers.set(event, set);
    return () => {
      set.delete(fn);
    };
  }, [event, enabled]);
}
export function useResync(_fn: () => void) {}
