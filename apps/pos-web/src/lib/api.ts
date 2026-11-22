import { checkForUpdate } from './appUpdate';
import { QueryClient } from '@tanstack/react-query';
import { errorReasonOf } from '@pos/shared';
import { ApiError, createApiClient, isApiError } from '@pos/shared/client';
import type { TFunction } from 'i18next';

export const UNAUTHORIZED_EVENT = 'pos:unauthorized';

/**
 * Klien API bertipe dari kontrak @pos/shared. Same-origin (`/api` diproksi Vite saat dev, Caddy saat prod).
 *   const { orders } = await api.call('ordersList', { query: { active: 'true' } });
 */
export const api = createApiClient({
  baseUrl: '',
  onUnauthorized: (key) => {
    if (key !== 'authMe' && key !== 'authPin') window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
  },
  // Aplikasi versi lama vs server baru → muat versi terbaru.
  onInvalidResponse: () => void checkForUpdate({ force: true }),
});

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      refetchOnWindowFocus: true,
      retry: (count, err) => !(isApiError(err) && err.status >= 400 && err.status < 500) && count < 2,
    },
    mutations: { retry: false },
  },
});

/** Query key standar supaya invalidasi konsisten antar layar. */
export const qk = {
  me: ['auth', 'me'] as const,
  loginUsers: ['auth', 'users'] as const,
  publicSettings: ['settings', 'public'] as const,
  menu: ['menu'] as const,
  orders: (filter?: object) => ['orders', filter ?? {}] as const,
  order: (id: string) => ['order', id] as const,
  tables: ['tables'] as const,
  tableBill: (tableId: number) => ['tables', tableId, 'bill'] as const,
  shift: ['shift', 'current'] as const,
  expenses: ['expenses'] as const,
  closingPreview: ['closing', 'preview'] as const,
  driverAvailable: ['driver', 'available'] as const,
  driverMine: ['driver', 'mine'] as const,
  adminSettings: ['admin', 'settings'] as const,
  staffSettings: ['settings', 'staff'] as const,
};

/**
 * Pesan error siap tampil dalam bahasa staf: alasan spesifik dari pesan server (`errorReason.*`,
 * lihat @pos/shared errorReasons) → kode error (`errors.*`) → `common.error`. Teks server mentah
 * (Bahasa Indonesia) tidak pernah ditampilkan apa adanya ke staf berbahasa lain. Error lokal browser
 * (kamera/printer) dilempar sebagai `new Error('localErr.<kunci>')`.
 */
export function errorMessage(err: unknown, t: TFunction): string {
  if (err instanceof ApiError) {
    const hit = errorReasonOf(err.message);
    if (hit) {
      const rk = `errorReason.${hit.reason}`;
      // parameter berupa kode status (cooking, ready, …) ikut diterjemahkan
      const params = Object.fromEntries(
        Object.entries(hit.params).map(([k, v]) => {
          const sk = `status.${v}`;
          const tr = t(sk);
          return [k, tr === sk ? v : tr];
        }),
      );
      const msg = t(rk, params);
      if (msg !== rk) return msg;
    }
    const key = `errors.${err.code}`;
    const msg = t(key);
    return msg === key ? t('common.error') : msg;
  }
  if (err instanceof Error && err.message.startsWith('localErr.')) {
    const msg = t(err.message);
    if (msg !== err.message) return msg;
  }
  return t('common.error');
}

/** Teks error perangkat (printer/kamera): kunci `localErr.*` diterjemahkan; pesan bawaan browser apa adanya. */
export function deviceErrorText(message: string, t: TFunction): string {
  return message.startsWith('localErr.') ? t(message) : message;
}

export { ApiError, isApiError };
