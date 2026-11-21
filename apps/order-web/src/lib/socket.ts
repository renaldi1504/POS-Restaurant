/**
 * Socket.IO pelanggan (room customer:<id> / table:<sessionId> ditentukan server dari cookie).
 *   useSocketEvent('order.updated', ({ order }) => queryClient.setQueryData(qk.order(order.id), { order }));
 * Setelah reconnect, `useResync` dipanggil → refetch status order / tagihan meja.
 */
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { io, type Socket } from 'socket.io-client';
import { SOCKET_PATH, type ClientToServerEvents, type CustomerServerToClientEvents } from '@pos/shared';

type Events = CustomerServerToClientEvents;
export type CustomerSocket = Socket<Events, ClientToServerEvents>;

let socket: CustomerSocket | null = null;
let connected = false;
let hadDisconnect = false;
const statusListeners = new Set<() => void>();
const resyncListeners = new Set<() => void>();

function setConnected(v: boolean) {
  connected = v;
  statusListeners.forEach((l) => l());
}

export function getSocket(): CustomerSocket {
  if (socket) return socket;
  socket = io({ path: SOCKET_PATH, withCredentials: true, reconnection: true, reconnectionDelayMax: 5000 });
  socket.on('connect', () => {
    setConnected(true);
    if (hadDisconnect) resyncListeners.forEach((l) => l());
  });
  socket.on('disconnect', () => {
    hadDisconnect = true;
    setConnected(false);
  });
  return socket;
}

/** Panggil setelah sesi pelanggan dibuat/berubah (cookie baru → room baru). */
export function reconnectSocket(): void {
  if (!socket) return void getSocket();
  const s = socket;
  hadDisconnect = true;
  const cycle = () => {
    s.disconnect();
    s.connect();
  };
  if (s.connected) return cycle();
  if (!s.active) return void s.connect();
  // Handshake sedang berjalan: memutus sekarang memicu peringatan browser
  // ("WebSocket is closed before the connection is established") → tunggu hasilnya dulu.
  const onConnect = () => {
    s.off('connect_error', onError);
    cycle();
  };
  const onError = () => {
    s.off('connect', onConnect);
    if (!s.active) s.connect();
  };
  s.once('connect', onConnect);
  s.once('connect_error', onError);
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

export function useResync(onResync: () => void): void {
  const ref = useRef(onResync);
  ref.current = onResync;
  useEffect(() => {
    const fn = () => ref.current();
    resyncListeners.add(fn);
    return () => {
      resyncListeners.delete(fn);
    };
  }, []);
}
