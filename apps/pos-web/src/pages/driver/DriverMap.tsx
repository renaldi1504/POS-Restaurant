/**
 * Peta tujuan antaran. Google Maps (@vis.gl/react-google-maps) bila VITE_GOOGLE_MAPS_API_KEY ada;
 * selain itu peta placeholder bergaya dengan pin bernomor yang diposisikan dari lat/lng.
 */
import { lazy, Suspense } from 'react';
import { cn } from '../../components/ui';

export interface MapPin {
  id: string;
  label: string;
  lat: number;
  lng: number;
  mine: boolean;
}

const GoogleDriverMap = lazy(() => import('./GoogleDriverMap'));

/** Posisi pin (persen) di dalam kotak, dari bounding box semua titik (+ restoran). */
export function layoutPins(pins: MapPin[], center: { lat: number; lng: number } | null, pad = 0.12) {
  const pts = [...pins.map((p) => ({ lat: p.lat, lng: p.lng })), ...(center ? [center] : [])];
  if (!pts.length) return { pins: [] as (MapPin & { x: number; y: number })[], center: null };
  let minLat = Math.min(...pts.map((p) => p.lat));
  let maxLat = Math.max(...pts.map((p) => p.lat));
  let minLng = Math.min(...pts.map((p) => p.lng));
  let maxLng = Math.max(...pts.map((p) => p.lng));
  // hindari pembagian nol (satu titik)
  if (maxLat - minLat < 0.002) {
    minLat -= 0.001;
    maxLat += 0.001;
  }
  if (maxLng - minLng < 0.002) {
    minLng -= 0.001;
    maxLng += 0.001;
  }
  const toXY = (lat: number, lng: number) => ({
    x: (pad + ((lng - minLng) / (maxLng - minLng)) * (1 - 2 * pad)) * 100,
    y: (pad + ((maxLat - lat) / (maxLat - minLat)) * (1 - 2 * pad)) * 100,
  });
  return {
    pins: pins.map((p) => ({ ...p, ...toXY(p.lat, p.lng) })),
    center: center ? toXY(center.lat, center.lng) : null,
  };
}

export function DriverMap({
  pins,
  center,
  restoLabel,
  label,
}: {
  pins: MapPin[];
  center: { lat: number; lng: number } | null;
  restoLabel: string;
  label: string;
}) {
  const key = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  if (key)
    return (
      <div aria-label={label} className="relative h-[210px] shrink-0 overflow-hidden bg-[#E8EDE4]">
        <Suspense fallback={null}>
          <GoogleDriverMap apiKey={key} pins={pins} center={center} restoLabel={restoLabel} />
        </Suspense>
      </div>
    );
  const lay = layoutPins(pins, center);
  return (
    <div
      role="img"
      aria-label={label}
      className="relative h-[210px] shrink-0 overflow-hidden bg-[#E8EDE4]"
      data-testid="placeholder-map"
    >
      <div className="absolute -inset-x-5 top-[60px] h-3 -rotate-[8deg] bg-white" />
      <div className="absolute -inset-x-5 top-[150px] h-[9px] rotate-[5deg] bg-white" />
      <div className="absolute -inset-y-5 left-[28%] w-[11px] rotate-[10deg] bg-white" />
      <div className="absolute -inset-y-5 left-[70%] w-[9px] -rotate-[6deg] bg-white" />
      {lay.center ? (
        <div
          className="absolute flex size-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-ink text-[11px] font-extrabold text-white shadow-[0_2px_6px_rgba(0,0,0,0.25)]"
          style={{ left: `${lay.center.x}%`, top: `${lay.center.y}%` }}
        >
          {restoLabel}
        </div>
      ) : null}
      {lay.pins.map((p) => (
        <div
          key={p.id}
          className="absolute flex -translate-x-1/2 -translate-y-full flex-col items-center"
          style={{ left: `${p.x}%`, top: `${p.y}%` }}
          data-testid="map-pin"
        >
          <span
            className={cn(
              'whitespace-nowrap rounded-lg px-2 py-1 text-xs font-extrabold text-white shadow-[0_2px_6px_rgba(0,0,0,0.2)]',
              p.mine ? 'bg-info' : 'bg-warn',
            )}
          >
            {p.label}
          </span>
          <span className={cn('h-2.5 w-0.5', p.mine ? 'bg-info' : 'bg-warn')} />
        </div>
      ))}
      <span className="absolute right-2.5 top-2.5 rounded-md bg-white/90 px-2 py-1 text-[11px] text-muted">
        Peta (mode uji)
      </span>
    </div>
  );
}
