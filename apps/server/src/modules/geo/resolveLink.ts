/**
 * Buka link pendek Google Maps (maps.app.goo.gl/…, goo.gl/maps/…) yang dikirim pelanggan → URL akhir + titik.
 *
 * Anti-SSRF: hanya host Google Maps di `MAPS_LINK_HOSTS` (dicek ulang di SETIAP redirect), tanpa port/
 * userinfo, http dinaikkan ke https, redirect diikuti manual maks 5x, batas waktu total 5 detik, body respons
 * tidak dibaca (langsung dibatalkan). Redirect ke host lain tidak dibuka — hanya teks URL-nya yang dibaca.
 */
import { isAllowedMapsUrl, parseLocationText, type LatLng } from '@pos/shared';
import { unprocessable } from '../../lib/errors';

export const RESOLVE_MAX_REDIRECTS = 5;
export const RESOLVE_TIMEOUT_MS = 5000;

export interface ResolvedLink {
  url: string;
  lat: number | null;
  lng: number | null;
}

const done = (url: URL | string, p: LatLng | null): ResolvedLink => ({
  url: String(url),
  lat: p?.lat ?? null,
  lng: p?.lng ?? null,
});

function toAllowedUrl(raw: string, base?: URL): URL | null {
  let u: URL;
  try {
    u = base ? new URL(raw, base) : new URL(raw);
  } catch {
    return null;
  }
  if (!isAllowedMapsUrl(u)) return null;
  if (u.protocol === 'http:') u.protocol = 'https:';
  return u;
}

export async function resolveMapsLink(
  input: string,
  deps: { fetchFn?: typeof fetch; maxRedirects?: number; timeoutMs?: number } = {},
): Promise<ResolvedLink> {
  const fetchFn = deps.fetchFn ?? fetch;
  const maxRedirects = deps.maxRedirects ?? RESOLVE_MAX_REDIRECTS;
  const start = toAllowedUrl(input.trim());
  if (!start) throw unprocessable('BAD_REQUEST', 'Link ini bukan link Google Maps');
  const direct = parseLocationText(start.href);
  if (direct) return done(start, direct);

  const signal = AbortSignal.timeout(deps.timeoutMs ?? RESOLVE_TIMEOUT_MS);
  let current = start;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    let res: Response;
    try {
      res = await fetchFn(current, {
        method: 'GET',
        redirect: 'manual',
        signal,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; POS-link-resolver/1.0)', Accept: 'text/html' },
      });
    } catch {
      throw unprocessable('BAD_REQUEST', 'Link lokasi tidak bisa dibuka, coba lagi');
    }
    // Body tidak dibutuhkan — jangan diunduh.
    void res.body?.cancel().catch(() => undefined);
    const location = res.headers.get('location');
    if (res.status < 300 || res.status >= 400 || !location) return done(current, null);
    if (hop === maxRedirects) break;
    const next = toAllowedUrl(location, current);
    if (!next) {
      // Host lain (mis. consent.google.com?continue=…): jangan dibuka, cukup baca teks URL-nya.
      const p = parseLocationText(location);
      if (p) return done(location, p);
      throw unprocessable('BAD_REQUEST', 'Link ini bukan link Google Maps');
    }
    const p = parseLocationText(next.href);
    if (p) return done(next, p);
    current = next;
  }
  throw unprocessable('BAD_REQUEST', 'Link dialihkan terlalu banyak kali');
}
