/**
 * Klien API bertipe yang dibangkitkan dari registri `endpoints`.
 *
 *   const api = createApiClient({ baseUrl: '' });
 *   const { user } = await api.call('authPin', { body: { userId: 2, pin: '1111' } });
 *   const { order } = await api.call('orderGet', { params: { id } });
 *   const blob = await api.call('adminTablesQrPdf', { query: { ids: '1,2' } });
 *
 * - Selalu `credentials: 'include'` (cookie sesi).
 * - Respons divalidasi dengan Zod (`parseResponses: false` untuk mematikan).
 * - Error HTTP → `ApiError` (code/status/message dari `{error:{code,message}}`).
 */
import {
  buildPath,
  endpoints,
  type EndpointBody,
  type EndpointDef,
  type EndpointKey,
  type EndpointParams,
  type EndpointQuery,
  type EndpointResponse,
} from './api';
import type { ErrorCode } from './enums';
import { ErrorResponse } from './schemas/common';

export class ApiError extends Error {
  readonly status: number;
  readonly code: ErrorCode | 'NETWORK_ERROR' | 'INVALID_RESPONSE';
  readonly details: unknown;
  constructor(status: number, code: ApiError['code'], message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function isApiError(e: unknown): e is ApiError {
  return e instanceof ApiError;
}

type Opt<T, K extends string> = [T] extends [undefined] ? { [P in K]?: undefined } : { [P in K]: T };

export type CallInput<K extends EndpointKey> = Opt<EndpointParams<K>, 'params'> &
  Opt<EndpointQuery<K>, 'query'> &
  Opt<EndpointBody<K>, 'body'> & { signal?: AbortSignal; headers?: Record<string, string> };

/** Input boleh dihilangkan bila endpoint tidak punya params/body wajib. */
type CallArgs<K extends EndpointKey> = [EndpointParams<K>, EndpointBody<K>] extends [undefined, undefined]
  ? [input?: CallInput<K>]
  : [input: CallInput<K>];

export interface ApiClientOptions {
  /** '' = same-origin (dev pakai proxy Vite). */
  baseUrl?: string;
  fetch?: typeof fetch;
  parseResponses?: boolean;
  /** Dipanggil untuk setiap 401 (mis. redirect ke login). */
  onUnauthorized?: (key: EndpointKey) => void;
}

function toQueryString(query: unknown): string {
  if (!query || typeof query !== 'object') return '';
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(query as Record<string, unknown>)) {
    if (v === undefined || v === null || v === '') continue;
    if (Array.isArray(v)) sp.set(k, v.join(','));
    else sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

export function createApiClient(opts: ApiClientOptions = {}) {
  const baseUrl = opts.baseUrl ?? '';
  const doFetch = opts.fetch ?? ((...a: Parameters<typeof fetch>) => globalThis.fetch(...a));
  const parse = opts.parseResponses ?? true;

  async function call<K extends EndpointKey>(key: K, ...args: CallArgs<K>): Promise<EndpointResponse<K>> {
    const def: EndpointDef = endpoints[key];
    const input = (args[0] ?? {}) as {
      params?: Record<string, string | number>;
      query?: unknown;
      body?: unknown;
      signal?: AbortSignal;
      headers?: Record<string, string>;
    };
    const url = baseUrl + buildPath(def.path, input.params) + toQueryString(input.query);
    const headers: Record<string, string> = { Accept: 'application/json', ...input.headers };
    let body: BodyInit | undefined;
    if (input.body instanceof FormData) {
      body = input.body;
    } else if (input.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(input.body);
    } else if (def.method !== 'GET' && def.method !== 'DELETE') {
      headers['Content-Type'] = 'application/json';
      body = '{}';
    }

    let res: Response;
    try {
      res = await doFetch(url, {
        method: def.method,
        headers,
        body,
        credentials: 'include',
        signal: input.signal,
      });
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') throw e;
      throw new ApiError(0, 'NETWORK_ERROR', 'Tidak bisa terhubung ke server');
    }

    if (!res.ok) {
      let payload: unknown = null;
      try {
        payload = await res.json();
      } catch {
        /* bukan JSON */
      }
      const parsed = ErrorResponse.safeParse(payload);
      if (res.status === 401) opts.onUnauthorized?.(key);
      if (parsed.success) {
        throw new ApiError(
          res.status,
          parsed.data.error.code,
          parsed.data.error.message,
          parsed.data.error.details,
        );
      }
      throw new ApiError(res.status, 'INTERNAL_ERROR', `HTTP ${res.status}`);
    }

    if (def.response === 'binary') return (await res.blob()) as EndpointResponse<K>;
    const json: unknown = res.status === 204 ? {} : await res.json();
    if (!parse) return json as EndpointResponse<K>;
    const result = def.response.safeParse(json);
    if (!result.success) {
      throw new ApiError(
        res.status,
        'INVALID_RESPONSE',
        `Respons ${key} tidak sesuai kontrak`,
        result.error.issues,
      );
    }
    return result.data as EndpointResponse<K>;
  }

  /** URL lengkap (untuk <a href> PDF, dll). */
  function url<K extends EndpointKey>(
    key: K,
    input: { params?: EndpointParams<K>; query?: EndpointQuery<K> } = {},
  ) {
    return (
      baseUrl +
      buildPath(endpoints[key].path, input.params as Record<string, string | number> | undefined) +
      toQueryString(input.query)
    );
  }

  return { call, url };
}

export type ApiClient = ReturnType<typeof createApiClient>;
