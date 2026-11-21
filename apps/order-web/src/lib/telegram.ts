/**
 * Helper Telegram Mini App. SDK dimuat dinamis hanya di mode /tg dan hanya bila kita memang di dalam Telegram
 * (bundle kecil, tidak memblokir halaman lain, aman di browser biasa).
 */
export interface TelegramUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

export interface TelegramWebApp {
  initData: string;
  initDataUnsafe: { user?: TelegramUser };
  version?: string;
  colorScheme?: 'light' | 'dark';
  ready(): void;
  expand(): void;
  close(): void;
  setHeaderColor?(color: string): void;
  setBackgroundColor?(color: string): void;
  BackButton?: { show(): void; hide(): void; onClick(cb: () => void): void; offClick(cb: () => void): void };
  LocationManager?: {
    isInited: boolean;
    isLocationAvailable: boolean;
    isAccessGranted?: boolean;
    init(cb?: () => void): void;
    getLocation(cb: (loc: { latitude: number; longitude: number } | null) => void): void;
    openSettings?(): void;
  };
  requestContact?(
    cb?: (
      ok: boolean,
      ev?: { status?: string; responseUnsafe?: { contact?: { phone_number?: string } } },
    ) => void,
  ): void;
  openLink?(url: string): void;
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
    TelegramWebviewProxy?: unknown;
  }
}

const SDK_URL = 'https://telegram.org/js/telegram-web-app.js';
/** Hash awal URL (Telegram menaruh `#tgWebAppData=...` saat membuka Mini App). Dibaca sekali saat modul dimuat. */
const INITIAL_HASH = typeof window !== 'undefined' ? window.location.hash : '';

let loading: Promise<TelegramWebApp | null> | null = null;
let current: TelegramWebApp | null = null;

/** initData dari hash URL (tanpa SDK). */
export function hashInitData(hash = INITIAL_HASH): string | null {
  if (!hash || hash.length < 2) return null;
  try {
    const v = new URLSearchParams(hash.slice(1)).get('tgWebAppData');
    return v && v.length > 0 ? v : null;
  } catch {
    return null;
  }
}

/** Ambil user dari string initData (`user=<json>`). */
export function parseInitDataUser(initData: string | null | undefined): TelegramUser | null {
  if (!initData) return null;
  try {
    const raw = new URLSearchParams(initData).get('user');
    return raw ? (JSON.parse(raw) as TelegramUser) : null;
  } catch {
    return null;
  }
}

/** Apakah halaman ini dibuka di dalam aplikasi Telegram? */
export function isInsideTelegram(): boolean {
  if (typeof window === 'undefined') return false;
  return !!window.Telegram?.WebApp?.initData || !!window.TelegramWebviewProxy || !!hashInitData();
}

export function getTelegram(): TelegramWebApp | null {
  return current ?? (typeof window !== 'undefined' ? (window.Telegram?.WebApp ?? null) : null);
}

function prepare(wa: TelegramWebApp): TelegramWebApp {
  try {
    wa.ready();
    wa.expand();
    // Warna tetap terang (tema kita sendiri) supaya kontras untuk orang tua, apa pun tema Telegram.
    wa.setHeaderColor?.('#FFFFFF');
    wa.setBackgroundColor?.('#F5F6F8');
  } catch {
    /* versi lama */
  }
  current = wa;
  return wa;
}

/**
 * Muat SDK Telegram (sekali) bila belum ada. Return null bila gagal / bukan di dalam Telegram.
 * Tidak memuat apa pun di browser biasa.
 */
export function loadTelegram(timeoutMs = 4000): Promise<TelegramWebApp | null> {
  const existing = window.Telegram?.WebApp;
  if (existing) return Promise.resolve(existing.initData || hashInitData() ? prepare(existing) : null);
  if (!isInsideTelegram()) return Promise.resolve(null);
  loading ??= new Promise((resolve) => {
    const s = document.createElement('script');
    s.src = SDK_URL;
    s.async = true;
    const timer = setTimeout(() => resolve(null), timeoutMs);
    s.onload = () => {
      clearTimeout(timer);
      const wa = window.Telegram?.WebApp ?? null;
      resolve(wa ? prepare(wa) : null);
    };
    s.onerror = () => {
      clearTimeout(timer);
      resolve(null);
    };
    document.head.appendChild(s);
  });
  return loading;
}

export type LocationResult =
  { ok: true; lat: number; lng: number } | { ok: false; reason: 'denied' | 'unavailable' };

/** Lokasi: Telegram LocationManager bila ada, selain itu navigator.geolocation. */
export async function getCurrentLocation(wa: TelegramWebApp | null): Promise<LocationResult> {
  const lm = wa?.LocationManager;
  if (lm) {
    const viaTg = await new Promise<LocationResult | null>((resolve) => {
      const go = () => {
        if (!lm.isLocationAvailable) return resolve(null);
        lm.getLocation((loc) =>
          resolve(
            loc ? { ok: true, lat: loc.latitude, lng: loc.longitude } : { ok: false, reason: 'denied' },
          ),
        );
      };
      try {
        if (lm.isInited) go();
        else lm.init(go);
      } catch {
        resolve(null);
      }
    });
    if (viaTg) return viaTg;
  }
  if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
    return { ok: false, reason: 'unavailable' };
  }
  return new Promise((resolve) =>
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ ok: true, lat: p.coords.latitude, lng: p.coords.longitude }),
      (err) => resolve({ ok: false, reason: err.code === 1 ? 'denied' : 'unavailable' }),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 30_000 },
    ),
  );
}

/** Minta no. HP lewat Telegram. Return no. HP bila Telegram mengirimkannya ke Mini App, '' bila dikirim ke bot saja, null bila ditolak/tidak didukung. */
export function requestTelegramPhone(wa: TelegramWebApp | null): Promise<string | null> {
  if (!wa?.requestContact) return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      wa.requestContact!((ok, ev) => {
        if (!ok) return resolve(null);
        resolve(ev?.responseUnsafe?.contact?.phone_number ?? '');
      });
    } catch {
      resolve(null);
    }
  });
}
