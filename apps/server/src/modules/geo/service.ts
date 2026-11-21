/**
 * Reverse geocode: titik GPS → alamat lengkap untuk form alamat pelanggan.
 * 1) Google Geocoding API bila GOOGLE_MAPS_API_KEY diisi (aktifkan "Geocoding API" di Google Cloud),
 * 2) selain itu / bila gagal: OpenStreetMap Nominatim (gratis, maks ±1 permintaan/detik, wajib User-Agent).
 * Hasil di-cache di memori per titik (dibulatkan ±11 m) supaya hemat kuota.
 */
import type { FastifyInstance } from 'fastify';
import type { Lang } from '@pos/shared';

export type GeoProvider = 'google' | 'osm' | 'none';
export interface GeoResult {
  text: string | null;
  provider: GeoProvider;
}

const GOOGLE_LANG: Record<Lang, string> = { id: 'id', en: 'en', kh: 'km', zh: 'zh-CN' };
const CACHE_MAX = 2000;
const cache = new Map<string, GeoResult>();
let osmQueue: Promise<unknown> = Promise.resolve();
let lastOsm = 0;

export function cacheKey(lat: number, lng: number, lang: Lang) {
  return `${lat.toFixed(4)},${lng.toFixed(4)},${lang}`;
}

/** Hapus kode plus (mis. "QHCF+6V ") & negara di akhir supaya ringkas. */
export function tidyAddress(text: string): string {
  return text
    .replace(/^[23456789CFGHJMPQRVWX]{4,8}\+[23456789CFGHJMPQRVWX]{2,3},?\s*/i, '')
    .replace(/,\s*(Cambodia|Kamboja|កម្ពុជា|柬埔寨)$/i, '')
    .trim();
}

async function google(
  app: FastifyInstance,
  lat: number,
  lng: number,
  lang: Lang,
  fetchFn: typeof fetch,
): Promise<string | null> {
  const key = app.config.GOOGLE_MAPS_API_KEY;
  if (!key) return null;
  try {
    const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
    url.searchParams.set('latlng', `${lat},${lng}`);
    url.searchParams.set('language', GOOGLE_LANG[lang]);
    url.searchParams.set('key', key);
    const res = await fetchFn(url, { signal: AbortSignal.timeout(6000) });
    const body = (await res.json()) as {
      status?: string;
      error_message?: string;
      results?: { formatted_address?: string; types?: string[] }[];
    };
    if (body.status !== 'OK' || !body.results?.length) {
      if (body.status && body.status !== 'ZERO_RESULTS')
        app.log.warn({ status: body.status, msg: body.error_message }, 'Google Geocoding gagal');
      return null;
    }
    // Lewati hasil yang hanya plus code
    const best = body.results.find((r) => !r.types?.includes('plus_code')) ?? body.results[0]!;
    return best.formatted_address ? tidyAddress(best.formatted_address) : null;
  } catch (err) {
    app.log.warn({ err: (err as Error).message }, 'Google Geocoding error');
    return null;
  }
}

async function osm(
  app: FastifyInstance,
  lat: number,
  lng: number,
  lang: Lang,
  fetchFn: typeof fetch,
): Promise<string | null> {
  // Antre & jeda ≥1,1 detik antar permintaan (kebijakan Nominatim).
  const run = async () => {
    const wait = lastOsm + 1100 - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastOsm = Date.now();
    try {
      const url = new URL('https://nominatim.openstreetmap.org/reverse');
      url.searchParams.set('format', 'jsonv2');
      url.searchParams.set('lat', String(lat));
      url.searchParams.set('lon', String(lng));
      url.searchParams.set('zoom', '18');
      url.searchParams.set('addressdetails', '0');
      url.searchParams.set('accept-language', `${GOOGLE_LANG[lang]},en`);
      const res = await fetchFn(url, {
        headers: { 'User-Agent': `RM-Berkat-POS/1.0 (${app.config.ORDER_ORIGIN})` },
        signal: AbortSignal.timeout(6000),
      });
      if (!res.ok) return null;
      const body = (await res.json()) as { display_name?: string; name?: string };
      if (!body.display_name) return null;
      return tidyAddress(body.display_name);
    } catch (err) {
      app.log.warn({ err: (err as Error).message }, 'OpenStreetMap reverse geocode error');
      return null;
    }
  };
  const p = osmQueue.then(run, run);
  osmQueue = p.catch(() => undefined);
  return p;
}

export async function reverseGeocode(
  app: FastifyInstance,
  lat: number,
  lng: number,
  lang: Lang = 'id',
  deps: { fetchFn?: typeof fetch } = {},
): Promise<GeoResult> {
  const fetchFn = deps.fetchFn ?? fetch;
  const k = cacheKey(lat, lng, lang);
  const hit = cache.get(k);
  if (hit) return hit;
  let result: GeoResult = { text: null, provider: 'none' };
  const g = await google(app, lat, lng, lang, fetchFn);
  if (g) result = { text: g, provider: 'google' };
  else if (app.config.GEOCODE_OSM_ENABLED) {
    const o = await osm(app, lat, lng, lang, fetchFn);
    if (o) result = { text: o, provider: 'osm' };
  }
  if (result.text) {
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!);
    cache.set(k, result);
  }
  return result;
}

export function clearGeocodeCache() {
  cache.clear();
}
