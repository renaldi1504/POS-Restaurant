import { describe, expect, expectTypeOf, it } from 'vitest';
import { ApiError, createApiClient } from '../src/client';

function mockFetch(status: number, body: unknown) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fn = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  }) as unknown as typeof fetch;
  return { fn, calls };
}

describe('createApiClient', () => {
  it('builds path/query, sends JSON with credentials and parses the response', async () => {
    const m = mockFetch(200, {
      user: {
        id: 2,
        name: 'Kasir Pagi',
        lang: 'id',
        role: { id: 2, name: 'Kasir' },
        permissions: ['order.create'],
      },
      expiresAt: '2026-11-21T10:00:00.000Z',
      extra: 'dibuang',
    });
    const api = createApiClient({ fetch: m.fn });
    const res = await api.call('authPin', { body: { userId: 2, pin: '1111' } });
    expectTypeOf(res.user.name).toBeString();
    expect(res.user.permissions).toEqual(['order.create']);
    expect((res as Record<string, unknown>).extra).toBeUndefined();
    expect(m.calls[0]?.url).toBe('/api/auth/pin');
    expect(m.calls[0]?.init.credentials).toBe('include');
    expect(m.calls[0]?.init.method).toBe('POST');
  });

  it('fills path params and query', async () => {
    const m = mockFetch(200, { orders: [], serverTime: '2026-11-21T10:00:00.000Z' });
    const api = createApiClient({ fetch: m.fn, baseUrl: 'http://x' });
    await api.call('ordersList', {
      query: { status: 'accepted,cooking', since: '2026-11-21T00:00:00.000Z' },
    });
    expect(m.calls[0]?.url).toBe(
      'http://x/api/orders?status=accepted%2Ccooking&since=2026-11-21T00%3A00%3A00.000Z',
    );
    expect(api.url('orderGet', { params: { id: 'abc' } })).toBe('http://x/api/orders/abc');
  });

  it('throws ApiError with server code', async () => {
    const m = mockFetch(423, {
      error: { code: 'PIN_LOCKED', message: 'Terkunci', details: { lockedUntil: 'x' } },
    });
    const api = createApiClient({ fetch: m.fn });
    await expect(api.call('authPin', { body: { userId: 1, pin: '0000' } })).rejects.toMatchObject({
      status: 423,
      code: 'PIN_LOCKED',
    });
    await expect(api.call('authPin', { body: { userId: 1, pin: '0000' } })).rejects.toBeInstanceOf(ApiError);
  });

  it('flags contract mismatch as INVALID_RESPONSE', async () => {
    const m = mockFetch(200, { users: [{ id: 'bukan-angka' }] });
    const api = createApiClient({ fetch: m.fn });
    await expect(api.call('authUsers')).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  it('type-checks inputs', () => {
    const api = createApiClient({ fetch: mockFetch(200, {}).fn });
    // @ts-expect-error body wajib untuk authPin
    void api.call('authPin').catch(() => {});
    // @ts-expect-error params wajib untuk orderGet
    void api.call('orderGet', {}).catch(() => {});
    void api.call('health').catch(() => {});
  });
});
