/**
 * Konteks pelanggan: mode (telegram / table / none), sesi server, Telegram WebApp, path "beranda" per mode.
 * - `/tg`          → login otomatis initData (POST /public/session/telegram)
 * - `/m/:qrToken`  → sesi meja (POST /public/session/table)
 * - `/`            → website biasa
 * Halaman lain (keranjang, alamat, …) memakai mode terakhir yang disimpan di sessionStorage.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useLocation, useNavigate } from 'react-router';
import {
  TableSessionRequest,
  type CustomerMode,
  type CustomerSessionResponse,
  type MenuAvailabilityPayload,
  type OrderType,
  type PublicMenuResponse,
  type PublicOrderEventPayload,
} from '@pos/shared';
import { api, isApiError, qk } from './api';
import { cartStore } from './cart';
import { useCheckout } from './checkout';
import { applyLangParam, applyTelegramLang } from './i18n';
import { reconnectSocket, useResync, useSocketEvent } from './socket';
import { readJson, writeJson } from './storage';
import {
  getTelegram,
  hashInitData,
  loadTelegram,
  parseInitDataUser,
  type TelegramUser,
  type TelegramWebApp,
} from './telegram';

export type BootErrorKind = 'qr_invalid' | 'tg_failed' | 'network';

export class BootError extends Error {
  constructor(
    readonly kind: BootErrorKind,
    message = kind,
  ) {
    super(message);
  }
}

export interface BootResult {
  session: CustomerSessionResponse | null;
  tg: TelegramWebApp | null;
  tgUser: TelegramUser | null;
}

interface Persisted {
  mode: CustomerMode;
  token: string | null;
}

const MODE_KEY = 'order.mode';

function routeMode(pathname: string): Persisted | null {
  if (pathname === '/tg' || pathname.startsWith('/tg/')) return { mode: 'telegram', token: null };
  const m = /^\/m\/([^/]+)/.exec(pathname);
  if (m) return { mode: 'table', token: decodeURIComponent(m[1]!) };
  if (pathname === '/') return { mode: 'none', token: null };
  return null;
}

/** Ambil `t` dari URL lalu hapus dari address bar (tidak ikut tersalin / dibagikan). */
function takeLinkToken(): string | null {
  if (typeof location === 'undefined') return null;
  const url = new URL(location.href);
  const t = url.searchParams.get('t');
  if (!t) return null;
  url.searchParams.delete('t');
  history.replaceState(history.state, '', url.pathname + url.search + url.hash);
  return t;
}

async function bootTelegram(): Promise<BootResult> {
  const fromHash = hashInitData();
  const wa = await loadTelegram();
  const initData = wa?.initData || fromHash;
  const tgUser = wa?.initDataUnsafe?.user ?? parseInitDataUser(initData);
  if (!applyLangParam(typeof location !== 'undefined' ? location.search : ''))
    applyTelegramLang(tgUser?.language_code);
  if (!initData) {
    // Tautan dari chat Telegram Business (?t=token) → tukar jadi sesi pelanggan Telegram.
    const linkToken = takeLinkToken();
    if (linkToken) {
      try {
        const session = await api.call('publicSessionTelegramLink', { body: { token: linkToken } });
        reconnectSocket();
        return { session, tg: wa, tgUser };
      } catch (e) {
        if (isApiError(e) && (e.status === 0 || e.status >= 500)) throw new BootError('network');
        /* token kedaluwarsa → coba sesi lama di bawah */
      }
    }
    // Bukan di dalam Telegram: pakai sesi Telegram lama bila cookie masih ada.
    try {
      const s = await api.call('publicSession');
      if (s.mode === 'telegram') return { session: s, tg: wa, tgUser };
    } catch {
      /* abaikan */
    }
    throw new BootError('tg_failed');
  }
  try {
    const session = await api.call('publicSessionTelegram', { body: { initData } });
    reconnectSocket();
    return { session, tg: wa, tgUser };
  } catch (e) {
    if (isApiError(e) && (e.status === 0 || e.status >= 500)) throw new BootError('network');
    throw new BootError('tg_failed');
  }
}

async function bootTable(token: string | null): Promise<BootResult> {
  if (!token || !TableSessionRequest.safeParse({ qrToken: token }).success) throw new BootError('qr_invalid');
  try {
    const session = await api.call('publicSessionTable', { body: { qrToken: token } });
    reconnectSocket();
    return { session, tg: null, tgUser: null };
  } catch (e) {
    if (isApiError(e) && e.status >= 400 && e.status < 500 && e.status !== 429)
      throw new BootError('qr_invalid');
    throw new BootError('network');
  }
}

async function bootNone(): Promise<BootResult> {
  try {
    const session = await api.call('publicSession');
    return { session, tg: null, tgUser: null };
  } catch {
    return { session: null, tg: null, tgUser: null };
  }
}

export function bootSession(mode: CustomerMode, token: string | null): Promise<BootResult> {
  if (mode === 'telegram') return bootTelegram();
  if (mode === 'table') return bootTable(token);
  return bootNone();
}

export interface CustomerContextValue {
  mode: CustomerMode;
  token: string | null;
  status: 'loading' | 'ready' | 'error';
  errorKind: BootErrorKind | null;
  session: CustomerSessionResponse | null;
  tg: TelegramWebApp | null;
  tgUser: TelegramUser | null;
  /** Path menu untuk mode ini. */
  homePath: string;
  /** Tipe pesanan efektif (dikunci untuk telegram & meja). */
  orderType: OrderType;
  typeLocked: boolean;
  retry: () => void;
}

const Ctx = createContext<CustomerContextValue | null>(null);

export function bootKey(mode: CustomerMode, token: string | null) {
  return ['boot', mode, token] as const;
}

export function CustomerProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fromRoute = useMemo(() => routeMode(location.pathname), [location.pathname]);
  const [persisted, setPersisted] = useState<Persisted>(() =>
    readJson<Persisted>('session', MODE_KEY, { mode: 'none', token: null }),
  );
  const active = fromRoute ?? persisted;

  useEffect(() => {
    if (fromRoute && (fromRoute.mode !== persisted.mode || fromRoute.token !== persisted.token)) {
      writeJson('session', MODE_KEY, fromRoute);
      setPersisted(fromRoute);
    }
  }, [fromRoute, persisted]);

  useLayoutEffect(() => {
    cartStore.setScope(active.mode === 'table' ? `table:${active.token ?? ''}` : 'online');
  }, [active.mode, active.token]);

  const boot = useQuery({
    queryKey: bootKey(active.mode, active.token),
    queryFn: () => bootSession(active.mode, active.token),
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const { state: checkout } = useCheckout();
  const typeLocked = active.mode !== 'none';
  const orderType: OrderType =
    active.mode === 'telegram' ? 'delivery' : active.mode === 'table' ? 'dine_in' : checkout.type;
  const homePath =
    active.mode === 'telegram'
      ? '/tg'
      : active.mode === 'table'
        ? `/m/${encodeURIComponent(active.token ?? '')}`
        : '/';

  // ---- Realtime ----
  useSocketEvent('menu.availability', (p: MenuAvailabilityPayload) => {
    qc.setQueryData<PublicMenuResponse>(qk.menu('all'), (menu) => {
      if (!menu) return menu;
      if (p.kind === 'item') {
        return {
          ...menu,
          items: menu.items.map((i) => (i.id === p.id ? { ...i, available: p.available } : i)),
        };
      }
      return {
        ...menu,
        optionGroups: menu.optionGroups.map((g) => ({
          ...g,
          options: g.options.map((o) => (o.id === p.id ? { ...o, available: p.available } : o)),
        })),
      };
    });
  });
  // Admin mengubah menu / grup pilihan / harga → muat ulang menu tanpa refresh.
  useSocketEvent('menu.changed', () => {
    void qc.invalidateQueries({ queryKey: qk.menu('all') });
  });
  const onOrder = (p: PublicOrderEventPayload) => {
    qc.setQueryData(qk.order(p.order.id), { order: p.order });
    if (p.order.table) void qc.invalidateQueries({ queryKey: qk.tableBill });
  };
  useSocketEvent('order.updated', onOrder);
  useSocketEvent('order.created', onOrder);
  useSocketEvent('table.updated', () => {
    void qc.invalidateQueries({ queryKey: qk.tableBill });
  });
  useResync(() => {
    void qc.invalidateQueries({ queryKey: ['order'] });
    void qc.invalidateQueries({ queryKey: qk.tableBill });
    void qc.invalidateQueries({ queryKey: qk.menu('all') });
  });

  // ---- Telegram BackButton (opsional) ----
  const tg = boot.data?.tg ?? (active.mode === 'telegram' ? getTelegram() : null);
  const atHome = location.pathname === homePath;
  useEffect(() => {
    const bb = tg?.BackButton;
    if (!bb) return;
    const onBack = () => navigate(-1);
    try {
      if (atHome) bb.hide();
      else {
        bb.show();
        bb.onClick(onBack);
      }
    } catch {
      /* versi lama */
    }
    return () => {
      try {
        bb.offClick(onBack);
      } catch {
        /* abaikan */
      }
    };
  }, [tg, atHome, navigate]);

  const err = boot.error;
  const value: CustomerContextValue = {
    mode: active.mode,
    token: active.token,
    status: boot.isPending ? 'loading' : boot.isError ? 'error' : 'ready',
    errorKind: err ? (err instanceof BootError ? err.kind : 'network') : null,
    session: boot.data?.session ?? null,
    tg,
    tgUser: boot.data?.tgUser ?? null,
    homePath,
    orderType,
    typeLocked,
    retry: () => void boot.refetch(),
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCustomer(): CustomerContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useCustomer harus di dalam <CustomerProvider>');
  return v;
}
