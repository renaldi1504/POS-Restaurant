import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { clearGeocodeCache, reverseGeocode, tidyAddress } from '../src/modules/geo/service';
import { call, createTestApp } from './helpers';

function fakeApp(over: Record<string, unknown> = {}) {
  return {
    config: {
      GOOGLE_MAPS_API_KEY: undefined,
      GEOCODE_OSM_ENABLED: true,
      ORDER_ORIGIN: 'https://order.example.com',
      ...over,
    },
    log: { warn: () => undefined },
  } as unknown as FastifyInstance;
}
const json = (b: unknown) => (async () => new Response(JSON.stringify(b))) as unknown as typeof fetch;

beforeEach(() => clearGeocodeCache());

describe('alamat dari GPS (reverse geocode)', () => {
  it('Google bila ada key: alamat rapi tanpa plus code & negara, bahasa Khmer = km', async () => {
    let url = '';
    const fetchFn = (async (u: URL) => {
      url = String(u);
      return new Response(
        JSON.stringify({
          status: 'OK',
          results: [
            { formatted_address: 'QHCF+6V Sihanoukville', types: ['plus_code'] },
            {
              formatted_address: 'Street 108, Sangkat 4, Sihanoukville, Cambodia',
              types: ['street_address'],
            },
          ],
        }),
      );
    }) as unknown as typeof fetch;
    const r = await reverseGeocode(fakeApp({ GOOGLE_MAPS_API_KEY: 'k' }), 10.627, 103.522, 'kh', { fetchFn });
    expect(r).toEqual({ text: 'Street 108, Sangkat 4, Sihanoukville', provider: 'google' });
    expect(url).toContain('language=km');
  });

  it('tanpa key: OpenStreetMap dengan User-Agent', async () => {
    let ua = '';
    const fetchFn = (async (_u: URL, init?: RequestInit) => {
      ua = String((init?.headers as Record<string, string>)['User-Agent']);
      return new Response(JSON.stringify({ display_name: 'Ekareach Street, Sihanoukville, Cambodia' }));
    }) as unknown as typeof fetch;
    const r = await reverseGeocode(fakeApp(), 10.6, 103.5, 'id', { fetchFn });
    expect(r).toEqual({ text: 'Ekareach Street, Sihanoukville', provider: 'osm' });
    expect(ua).toContain('RM-Berkat-POS');
  });

  it('semua gagal → text null; hasil sukses di-cache', async () => {
    const fail = (async () => new Response('x', { status: 500 })) as unknown as typeof fetch;
    expect(await reverseGeocode(fakeApp(), 1, 2, 'id', { fetchFn: fail })).toEqual({
      text: null,
      provider: 'none',
    });
    await reverseGeocode(fakeApp(), 3, 4, 'id', { fetchFn: json({ display_name: 'A' }) });
    expect(await reverseGeocode(fakeApp(), 3, 4, 'id', { fetchFn: fail })).toEqual({
      text: 'A',
      provider: 'osm',
    });
    expect(tidyAddress('7J6F+QX, Jl. A, Kamboja')).toBe('Jl. A');
  });
});

describe('GET /api/public/geocode', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await createTestApp();
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
  });
  it('publik, validasi koordinat, tanpa layanan → text null', async () => {
    const ok = await call(app, 'publicReverseGeocode', { query: { lat: '10.6', lng: '103.5', lang: 'en' } });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toEqual({ text: null, provider: 'none' });
    const bad = await call(app, 'publicReverseGeocode', { query: { lat: '200', lng: '103.5' } });
    expect(bad.statusCode).toBe(400);
  });
});
