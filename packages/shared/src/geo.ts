export interface LatLng {
  lat: number;
  lng: number;
}

/** Jarak lurus (km) antara dua titik — rumus haversine. */
export function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** URL navigasi Google Maps ke satu tujuan. */
export function mapsDirectionsUrl(dest: LatLng): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${dest.lat},${dest.lng}`;
}

/** URL navigasi beberapa tujuan: tujuan terakhir = destination, sisanya waypoints. */
export function mapsMultiStopUrl(stops: LatLng[]): string | null {
  if (stops.length === 0) return null;
  const last = stops[stops.length - 1]!;
  const base = mapsDirectionsUrl(last);
  if (stops.length === 1) return base;
  const waypoints = stops
    .slice(0, -1)
    .map((s) => `${s.lat},${s.lng}`)
    .join('|');
  return `${base}&waypoints=${encodeURIComponent(waypoints)}`;
}

/** Format jarak: 0.8 → "800 m", 2.345 → "2,3 km". */
export function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1).replace('.', ',')} km`;
}

// ---------------- Link lokasi (Google Maps, WhatsApp, Telegram, OSM, "lat,lng") ----------------

/** Host Google Maps yang boleh dibuka server untuk mengikuti redirect link pendek. */
export const MAPS_LINK_HOSTS = [
  'maps.app.goo.gl',
  'goo.gl',
  'maps.google.com',
  'www.google.com',
  'google.com',
];

const NUM = String.raw`[-+]?\d{1,3}(?:\.\d+)?`;

function validPoint(lat: number, lng: number): LatLng | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  if (lat === 0 && lng === 0) return null;
  return { lat, lng };
}

function pair(s: string | null | undefined): LatLng | null {
  if (!s) return null;
  const m = new RegExp(String.raw`^\s*(${NUM})\s*[, ]\s*(${NUM})\s*$`).exec(s);
  return m ? validPoint(Number(m[1]), Number(m[2])) : null;
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s.replace(/\+/g, ' '));
  } catch {
    return s;
  }
}

/** Ambil URL pertama dari teks yang ditempel (mis. "Lokasi saya: https://maps.app.goo.gl/abc"). */
export function extractUrl(text: string): string | null {
  const m = /(?:https?:\/\/|geo:)[^\s<>"']+/i.exec(text);
  return m ? m[0].replace(/[).,;!?]+$/, '') : null;
}

/**
 * Titik lat/lng dari teks yang ditempel kasir: link Google Maps (`@lat,lng`, `!3dLAT!4dLNG`, `q=`, `ll=`,
 * `query=`, `destination=`, `center=`), link OpenStreetMap (`mlat`/`mlon`, `#map=z/lat/lng`), `geo:lat,lng`,
 * atau koordinat mentah "10.61, 103.52". Link pendek (maps.app.goo.gl) tidak berisi titik → null
 * (selesaikan lewat server, lihat `isShortMapsLink`).
 */
export function parseLocationText(input: string): LatLng | null {
  const text = input.trim();
  if (!text) return null;
  // Koordinat mentah wajib berdesimal (supaya no. HP "012 123" tidak dianggap titik).
  const raw = /^\s*[-+]?\d{1,3}\.\d+\s*[, ]\s*[-+]?\d{1,3}\.\d+\s*$/.test(text) ? pair(text) : null;
  if (raw) return raw;
  const urlStr = extractUrl(text);
  if (!urlStr) return null;
  const decoded = safeDecode(urlStr);
  // 1) Titik tempat (lebih tepat dari tengah peta "@")
  const place = new RegExp(String.raw`!3d(${NUM})!4d(${NUM})`).exec(decoded);
  if (place) {
    const p = validPoint(Number(place[1]), Number(place[2]));
    if (p) return p;
  }
  // 2) geo:lat,lng
  const geo = new RegExp(String.raw`^geo:(${NUM}),(${NUM})`, 'i').exec(decoded);
  if (geo) return validPoint(Number(geo[1]), Number(geo[2]));
  // 3) Parameter query
  let url: URL | null = null;
  try {
    url = new URL(urlStr);
  } catch {
    url = null;
  }
  if (url) {
    const sp = url.searchParams;
    for (const k of ['q', 'query', 'll', 'destination', 'daddr', 'center', 'sll', 'location']) {
      const v = sp.get(k);
      const p = pair(v?.replace(/^loc:/i, ''));
      if (p) return p;
    }
    const mlat = sp.get('mlat');
    const mlon = sp.get('mlon');
    if (mlat && mlon) {
      const p = validPoint(Number(mlat), Number(mlon));
      if (p) return p;
    }
    const hashMap = new RegExp(String.raw`map=\d+(?:\.\d+)?/(${NUM})/(${NUM})`).exec(url.hash);
    if (hashMap) {
      const p = validPoint(Number(hashMap[1]), Number(hashMap[2]));
      if (p) return p;
    }
  }
  // 4) "@lat,lng" di path (tengah peta)
  const at = new RegExp(String.raw`@(${NUM}),(${NUM})`).exec(decoded);
  if (at) {
    const p = validPoint(Number(at[1]), Number(at[2]));
    if (p) return p;
  }
  // 5) "/maps/search/lat,lng" atau "/place/lat,lng"
  const path = new RegExp(String.raw`/(?:search|place|dir)/(${NUM}),\s*(${NUM})`).exec(decoded);
  if (path) return validPoint(Number(path[1]), Number(path[2]));
  return null;
}

/** URL https di host Google Maps yang diizinkan (dipakai klien & server; server WAJIB memeriksa ulang). */
export function isAllowedMapsUrl(u: URL): boolean {
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
  if (u.username || u.password || u.port) return false;
  const host = u.hostname.toLowerCase();
  if (!MAPS_LINK_HOSTS.includes(host)) return false;
  if (host === 'goo.gl' || host === 'google.com' || host === 'www.google.com')
    return u.pathname === '/maps' || u.pathname.startsWith('/maps/') || u.pathname.startsWith('/maps?');
  return true;
}

/** Link Google Maps yang perlu dibuka server (link pendek, atau link Maps tanpa titik di teksnya). */
export function needsServerResolve(text: string): string | null {
  if (parseLocationText(text)) return null;
  const s = extractUrl(text);
  if (!s) return null;
  try {
    const u = new URL(s);
    return isAllowedMapsUrl(u) ? u.href : null;
  } catch {
    return null;
  }
}
