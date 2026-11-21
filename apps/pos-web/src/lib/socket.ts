/**
 * Socket.IO klien (path /ws, cookie sesi ikut otomatis) dengan reconnect + sinkronisasi `since`.
 *
 *   const { connected } = useSocketStatus();
 *   useSocketEvent('order.created', (p) => queryClient.invalidateQueries({ queryKey: ['orders'] }));
 *   useResync(async (since) => { const r = await api.call('ordersList', { query: { since } }); ... });
 *
 * Setiap event menyimpan `at` sebagai lastEventAt (localStorage). Setelah koneksi putus lalu tersambung
 * lagi, callback `useResync` dipanggil dengan lastEventAt → panggil `GET /orders?since=`.
 */
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { io, type Socket } from 'socket.io-client';
import { SOCKET_PATH, type ClientToServerEvents, type StaffServerToClientEvents } from '@pos/shared';

type Events = StaffServerToClientEvents;
export type AppSocket = Socket<Events, ClientToServerEvents>;

const LAST_EVENT_KEY = 'pos.lastEventAt';
let socket: AppSocket | null = null;
let connected = false;
let hadDisconnect = false;
const statusListeners = new Set<() => void>();
const resyncListeners = new Set<(since: string) => void>();

export function getLastEventAt(): string {
  return localStorage.getItem(LAST_EVENT_KEY) ?? new Date(Date.now() - 5 * 60_000).toISOString();
}
export function setLastEventAt(iso: string): void {
  const prev = localStorage.getItem(LAST_EVENT_KEY);
  if (!prev || iso > prev) localStorage.setItem(LAST_EVENT_KEY, iso);
}

function setConnected(v: boolean) {
  connected = v;
  statusListeners.forEach((l) => l());
}

/** Socket singleton (dibuat saat pertama dipakai). */
export function getSocket(): AppSocket {
  if (socket) return socket;
  socket = io({
    path: SOCKET_PATH,
    withCredentials: true,
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 500,
    reconnectionDelayMax: 5000,
  });
  socket.on('connect', () => {
    setConnected(true);
    if (hadDisconnect) {
      const since = getLastEventAt();
      resyncListeners.forEach((l) => l(since));
    }
  });
  socket.on('disconnect', () => {
    hadDisconnect = true;
    setConnected(false);
  });
  socket.onAny((_event, payload: unknown) => {
    const at = (payload as { at?: unknown } | null)?.at;
    if (typeof at === 'string') setLastEventAt(at);
  });
  return socket;
}

/** Sambung ulang dengan cookie baru (panggil setelah login/logout). */
export function reconnectSocket(): void {
  if (!socket) return void getSocket();
  socket.disconnect();
  hadDisconnect = true;
  socket.connect();
}

export function disconnectSocket(): void {
  socket?.disconnect();
}

export function useSocketStatus(): { connected: boolean } {
  const value = useSyncExternalStore(
    (cb) => {
      statusListeners.add(cb);
      return () => statusListeners.delete(cb);
    },
    () => connected,
    () => false,
  );
  return { connected: value };
}

/** Langganan event bertipe; handler terbaru selalu dipakai (tanpa re-subscribe). */
export function useSocketEvent<E extends keyof Events>(event: E, handler: Events[E], enabled = true): void {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    if (!enabled) return;
    const s = getSocket();
    const fn = ((...args: Parameters<Events[E]>) =>
      (ref.current as (...a: unknown[]) => void)(...args)) as never;
    s.on(event, fn);
    return () => {
      s.off(event, fn);
    };
  }, [event, enabled]);
}

/** Dipanggil setelah reconnect dengan `since` = lastEventAt. */
export function useResync(onResync: (since: string) => void | Promise<void>): void {
  const ref = useRef(onResync);
  ref.current = onResync;
  useEffect(() => {
    const fn = (since: string) => void ref.current(since);
    resyncListeners.add(fn);
    return () => {
      resyncListeners.delete(fn);
    };
  }, []);
}
