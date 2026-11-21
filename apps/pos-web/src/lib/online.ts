/**
 * Order online yang menunggu diterima (website / Telegram / QR meja): jumlah untuk badge bel +
 * bunyi berulang sampai layar Order online dibuka.
 */
import { useQuery } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';
import { hasPermission, ONLINE_CHANNELS, type OrderDto } from '@pos/shared';
import { api, qk } from './api';
import { useMe } from './auth';
import { beep, useRepeatingAlarm } from './sound';
import { useSocketEvent } from './socket';

const seen = new Set<string>();
const listeners = new Set<() => void>();
let version = 0;

/** Tandai order sudah dilihat (layar Order online dibuka) → bunyi berhenti. */
export function markOnlineSeen(ids: string[]): void {
  let changed = false;
  for (const id of ids) {
    if (!seen.has(id)) {
      seen.add(id);
      changed = true;
    }
  }
  if (changed) {
    version++;
    listeners.forEach((l) => l());
  }
}

function useSeenVersion() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => version,
    () => version,
  );
}

export const PENDING_FILTER = { status: 'pending_accept', active: 'true' } as const;

/** Order dari pelanggan (website / bot Telegram / QR meja) — bukan order Telegram yang diketik kasir. */
export function isOnlineOrder(o: Pick<OrderDto, 'channel' | 'createdByStaff'>): boolean {
  return ONLINE_CHANNELS.includes(o.channel) && !o.createdByStaff;
}

export function usePendingOnline() {
  const { data: me } = useMe();
  const allowed = hasPermission(me?.permissions, 'order.accept');
  return useQuery({
    queryKey: qk.orders(PENDING_FILTER),
    queryFn: async () =>
      (await api.call('ordersList', { query: PENDING_FILTER })).orders.filter(isOnlineOrder),
    enabled: allowed,
    refetchInterval: 20_000,
  });
}

/** Badge + alarm untuk header kasir. `onOnlineScreen` = layar order online sedang terbuka. */
export function useOnlineAlarm(onOnlineScreen: boolean): { count: number; unseen: number } {
  const pending = usePendingOnline();
  useSeenVersion();
  const orders = pending.data ?? [];
  const unseen = orders.filter((o) => !seen.has(o.id)).length;
  useSocketEvent('order.created', (p) => {
    if (isOnlineOrder(p.order) && p.order.status === 'pending_accept' && onOnlineScreen) beep('order');
  });
  useRepeatingAlarm(unseen > 0 && !onOnlineScreen, 'order', 4000);
  return { count: orders.length, unseen };
}
