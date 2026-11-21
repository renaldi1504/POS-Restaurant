/**
 * Hook data bersama (TanStack Query) + jembatan realtime global.
 */
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import {
  DEFAULT_SETTINGS,
  type Currency,
  type OrderDto,
  type PublicSettingsResponse,
  type Rates,
  type StaffMenuResponse,
  type StaffSettingsResponse,
} from '@pos/shared';
import { api, qk } from './api';
import { useMe } from './auth';
import { applyTextSize, usePrefs } from './prefs';
import { useResync, useSocketEvent } from './socket';

export function usePublicSettings() {
  return useQuery({
    queryKey: qk.publicSettings,
    queryFn: () => api.call('publicSettings'),
    staleTime: 5 * 60_000,
    retry: 1,
  });
}

export interface MoneyCtx {
  main: Currency;
  rates: Rates;
  enabled: Currency[];
  /** Mata uang lain untuk tampilan perkiraan (≈). */
  others: Currency[];
}

const FALLBACK_MONEY: MoneyCtx = {
  main: DEFAULT_SETTINGS.currency.main,
  rates: DEFAULT_SETTINGS.currency.rates,
  enabled: DEFAULT_SETTINGS.currency.enabled,
  others: DEFAULT_SETTINGS.currency.enabled.filter((c) => c !== DEFAULT_SETTINGS.currency.main),
};

export function moneyCtxFrom(s: PublicSettingsResponse | undefined): MoneyCtx {
  if (!s) return FALLBACK_MONEY;
  return {
    main: s.currency.main,
    rates: s.currency.rates,
    enabled: s.currency.enabled,
    others: s.currency.enabled.filter((c) => c !== s.currency.main),
  };
}

/** Mata uang utama + kurs dari settings publik (fallback default SPEC). */
export function useMoney(): MoneyCtx {
  const { data } = usePublicSettings();
  return moneyCtxFrom(data);
}

/** Settings yang dibaca semua staf (`GET /settings/staff`): dapur, shift, ukuran teks, komisi. */
export function useStaffSettingsQuery() {
  const { data: me } = useMe();
  return useQuery({
    queryKey: qk.staffSettings,
    queryFn: () => api.call('staffSettings'),
    enabled: !!me,
    staleTime: 60_000,
  });
}

export type StaffSettings = StaffSettingsResponse['settings'];
/** Selagi memuat: nilai default dari kontrak (`DEFAULT_SETTINGS`), bukan angka tertanam di layar. */
export const STAFF_SETTINGS_FALLBACK: StaffSettings = {
  ui: DEFAULT_SETTINGS.ui,
  kitchen: DEFAULT_SETTINGS.kitchen,
  shift: DEFAULT_SETTINGS.shift,
  commissions: DEFAULT_SETTINGS.commissions,
  delivery: DEFAULT_SETTINGS.delivery,
  qr: DEFAULT_SETTINGS.qr,
};

export function useStaffSettings(): StaffSettings {
  return useStaffSettingsQuery().data?.settings ?? STAFF_SETTINGS_FALLBACK;
}

/** Terapkan ukuran teks: pilihan perangkat, atau default toko bila belum dipilih. */
export function TextSizeSync() {
  const prefs = usePrefs();
  const s = useStaffSettings();
  const size = prefs.textSize ?? s.ui.textSize;
  useEffect(() => applyTextSize(size), [size]);
  return null;
}

export function useStaffMenu() {
  return useQuery({ queryKey: qk.menu, queryFn: () => api.call('menuStaff'), staleTime: 60_000 });
}

export function useCurrentShift() {
  return useQuery({
    queryKey: qk.shift,
    queryFn: async () => (await api.call('shiftCurrent')).shift,
    staleTime: 30_000,
  });
}

/** Tanam/ganti order di semua cache daftar order yang relevan. */
export function upsertOrderInCaches(qc: QueryClient, order: OrderDto): void {
  qc.setQueryData(qk.order(order.id), { order });
}

/**
 * Dipasang sekali di root (saat login): event socket → invalidasi cache yang terkait,
 * reconnect → sinkron ulang semua daftar.
 */
export function RealtimeBridge() {
  const qc = useQueryClient();
  const { data: me } = useMe();
  const enabled = !!me;

  useSocketEvent(
    'order.created',
    (p) => {
      upsertOrderInCaches(qc, p.order);
      void qc.invalidateQueries({ queryKey: ['orders'] });
      void qc.invalidateQueries({ queryKey: qk.tables });
    },
    enabled,
  );
  useSocketEvent(
    'order.updated',
    (p) => {
      upsertOrderInCaches(qc, p.order);
      void qc.invalidateQueries({ queryKey: ['orders'] });
      void qc.invalidateQueries({ queryKey: ['driver'] });
      if (p.order.tableSessionId) void qc.invalidateQueries({ queryKey: qk.tables });
    },
    enabled,
  );
  useSocketEvent(
    'order.ready_for_pickup',
    () => void qc.invalidateQueries({ queryKey: ['driver'] }),
    enabled,
  );
  useSocketEvent('table.updated', () => void qc.invalidateQueries({ queryKey: qk.tables }), enabled);
  useSocketEvent(
    'payment.proof_received',
    () => void qc.invalidateQueries({ queryKey: ['orders'] }),
    enabled,
  );
  useSocketEvent(
    'menu.availability',
    (p) => {
      qc.setQueryData<StaffMenuResponse>(qk.menu, (old) => {
        if (!old) return old;
        if (p.kind === 'item')
          return {
            ...old,
            items: old.items.map((i) => (i.id === p.id ? { ...i, available: p.available } : i)),
          };
        return {
          ...old,
          optionGroups: old.optionGroups.map((g) => ({
            ...g,
            options: g.options.map((o) => (o.id === p.id ? { ...o, available: p.available } : o)),
          })),
        };
      });
    },
    enabled,
  );
  useResync(() => {
    void qc.invalidateQueries();
  });

  // Tanpa koneksi socket (mis. server mati sebentar) tetap segar: polling ringan tiap 30 dtk.
  useEffect(() => {
    if (!enabled) return;
    const id = window.setInterval(() => void qc.invalidateQueries({ queryKey: ['orders'] }), 30_000);
    return () => window.clearInterval(id);
  }, [enabled, qc]);
  return null;
}
