import { QueryClient } from '@tanstack/react-query';
import { PublicOrderResponse, type PublicOrderResponse as PublicOrderResponseT } from '@pos/shared';
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

/**
 * Upload bukti ABA (multipart, field `file`). Klien bertipe tidak mendukung body FormData untuk endpoint
 * tanpa schema body, jadi dikirim manual lalu divalidasi dengan schema kontrak.
 */
export async function uploadProof(
  orderId: string,
  file: Blob,
  filename = 'bukti.jpg',
): Promise<PublicOrderResponseT> {
  const fd = new FormData();
  fd.append('file', file, filename);
  let res: Response;
  try {
    res = await fetch(api.url('publicOrderProof', { params: { id: orderId } }), {
      method: 'POST',
      body: fd,
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'Tidak bisa terhubung ke server');
  }
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    /* bukan JSON */
  }
  if (!res.ok) {
    const e = (json as { error?: { code?: string; message?: string } } | null)?.error;
    throw new ApiError(
      res.status,
      (e?.code ?? 'INTERNAL_ERROR') as ApiError['code'],
      e?.message ?? `HTTP ${res.status}`,
    );
  }
  const parsed = PublicOrderResponse.safeParse(json);
  if (!parsed.success)
    throw new ApiError(res.status, 'INVALID_RESPONSE', 'Respons upload tidak sesuai kontrak');
  return parsed.data;
}

export { ApiError, isApiError };
