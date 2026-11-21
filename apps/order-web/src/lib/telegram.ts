/**
 * Helper Telegram Mini App. SDK dimuat dinamis hanya di mode /tg (bundle kecil & tidak memblokir halaman lain).
 */
export interface TelegramWebApp {
  initData: string;
  initDataUnsafe: {
    user?: { id: number; first_name?: string; last_name?: string; username?: string; language_code?: string };
  };
  ready(): void;
  expand(): void;
  close(): void;
  colorScheme: 'light' | 'dark';
  BackButton: { show(): void; hide(): void; onClick(cb: () => void): void; offClick(cb: () => void): void };
  LocationManager?: {
    isInited: boolean;
    isLocationAvailable: boolean;
    init(cb?: () => void): void;
    getLocation(cb: (loc: { latitude: number; longitude: number } | null) => void): void;
  };
  openLink(url: string): void;
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

const SDK_URL = 'https://telegram.org/js/telegram-web-app.js';
let loading: Promise<TelegramWebApp | null> | null = null;

/** Muat SDK Telegram (sekali). Return null bila gagal / bukan di dalam Telegram. */
export function loadTelegram(timeoutMs = 4000): Promise<TelegramWebApp | null> {
  if (window.Telegram?.WebApp) return Promise.resolve(window.Telegram.WebApp);
  loading ??= new Promise((resolve) => {
    const s = document.createElement('script');
    s.src = SDK_URL;
    s.async = true;
    const timer = setTimeout(() => resolve(null), timeoutMs);
    s.onload = () => {
      clearTimeout(timer);
      const wa = window.Telegram?.WebApp ?? null;
      wa?.ready();
      wa?.expand();
      resolve(wa && wa.initData ? wa : null);
    };
    s.onerror = () => {
      clearTimeout(timer);
      resolve(null);
    };
    document.head.appendChild(s);
  });
  return loading;
}

/** Lokasi: Telegram LocationManager bila ada, selain itu navigator.geolocation. */
export async function getCurrentLocation(
  wa: TelegramWebApp | null,
): Promise<{ lat: number; lng: number } | null> {
  const lm = wa?.LocationManager;
  if (lm) {
    const viaTg = await new Promise<{ lat: number; lng: number } | null>((resolve) => {
      const go = () =>
        lm.getLocation((loc) => resolve(loc ? { lat: loc.latitude, lng: loc.longitude } : null));
      if (lm.isInited) go();
      else lm.init(go);
    });
    if (viaTg) return viaTg;
  }
  if (!('geolocation' in navigator)) return null;
  return new Promise((resolve) =>
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 10_000 },
    ),
  );
}
