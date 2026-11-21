import { QueryClient } from '@tanstack/react-query';
import { ApiError, createApiClient, isApiError } from '@pos/shared/client';
import type { TFunction } from 'i18next';

/**
 * Klien API bertipe (kontrak @pos/shared). Cookie sesi pelanggan `pos_cust` ikut otomatis.
 *   const menu = await api.call('publicMenu', { query: { lang: 'kh' } });
 */
export const api = createApiClient({ baseUrl: '' });

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (count, err) => !(isApiError(err) && err.status >= 400 && err.status < 500) && count < 2,
    },
    mutations: { retry: false },
  },
});

export const qk = {
  session: ['session'] as const,
  settings: ['settings'] as const,
  menu: (lang: string) => ['menu', lang] as const,
  order: (id: string) => ['order', id] as const,
  myOrders: ['orders', 'mine'] as const,
  tableBill: ['table', 'bill'] as const,
  addresses: ['addresses'] as const,
};

export function errorMessage(err: unknown, t: TFunction): string {
  if (err instanceof ApiError) {
    const key = `errors.${err.code}`;
    const msg = t(key);
    return msg === key ? err.message : msg;
  }
  return t('common.error');
}

export { ApiError, isApiError };
