import { QueryClient } from '@tanstack/react-query';
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
};

/** Pesan error siap tampil (pakai kamus `errors.*`). */
export function errorMessage(err: unknown, t: TFunction): string {
  if (err instanceof ApiError) {
    const key = `errors.${err.code}`;
    const msg = t(key);
    return msg === key ? err.message : msg;
  }
  return t('common.error');
}

export { ApiError, isApiError };
