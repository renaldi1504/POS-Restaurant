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
