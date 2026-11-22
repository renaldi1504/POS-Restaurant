/**
 * Titik lokasi dari teks yang ditempel kasir (link Google Maps / WhatsApp / Telegram / OSM, atau "lat,lng").
 * Diurai di browser bila bisa; link pendek (maps.app.goo.gl) dibuka server (`POST /geo/resolve-link`).
 */
import { extractUrl, needsServerResolve, parseLocationText, type LatLng } from '@pos/shared';

export type LocateResult =
  | { kind: 'empty' }
  | { kind: 'point'; point: LatLng; viaServer: boolean }
  /** Bukan link lokasi yang dikenali (mis. link situs lain). */
  | { kind: 'unknown' }
  /** Link Google Maps tanpa titik (mis. hanya nama tempat). */
  | { kind: 'no_point' };

export async function locateFromText(
  text: string,
  resolve: (url: string) => Promise<{ lat: number | null; lng: number | null }>,
): Promise<LocateResult> {
  const trimmed = text.trim();
  if (!trimmed) return { kind: 'empty' };
  const local = parseLocationText(trimmed);
  if (local) return { kind: 'point', point: local, viaServer: false };
  const url = needsServerResolve(trimmed);
  if (!url) return { kind: 'unknown' };
  const r = await resolve(url);
  if (r.lat == null || r.lng == null) return { kind: 'no_point' };
  return { kind: 'point', point: { lat: r.lat, lng: r.lng }, viaServer: true };
}

/** Teks terlihat seperti link/koordinat (layak diproses otomatis saat diketik/ditempel). */
export function looksLikeLocation(text: string): boolean {
  const t = text.trim();
  return !!extractUrl(t) || /^[-+]?\d{1,3}\.\d+\s*[, ]\s*[-+]?\d{1,3}\.\d+$/.test(t);
}

export const formatPoint = (p: LatLng) => `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`;
