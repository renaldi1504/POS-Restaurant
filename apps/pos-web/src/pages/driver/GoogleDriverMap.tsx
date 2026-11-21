import { AdvancedMarker, APIProvider, Map } from '@vis.gl/react-google-maps';
import type { MapPin } from './DriverMap';

export default function GoogleDriverMap({
  apiKey,
  pins,
  center,
  restoLabel,
}: {
  apiKey: string;
  pins: MapPin[];
  center: { lat: number; lng: number } | null;
  restoLabel: string;
}) {
  const c = center ?? (pins[0] ? { lat: pins[0].lat, lng: pins[0].lng } : { lat: 10.6278, lng: 103.5221 });
  return (
    <APIProvider apiKey={apiKey}>
      <Map
        defaultCenter={c}
        defaultZoom={13}
        mapId="pos-driver"
        disableDefaultUI
        gestureHandling="greedy"
        style={{ width: '100%', height: '100%' }}
      >
        {center ? (
          <AdvancedMarker position={center}>
            <div className="flex size-9 items-center justify-center rounded-full bg-ink text-[11px] font-extrabold text-white">
              {restoLabel}
            </div>
          </AdvancedMarker>
        ) : null}
        {pins.map((p) => (
          <AdvancedMarker key={p.id} position={{ lat: p.lat, lng: p.lng }}>
            <span
              className={`rounded-lg px-2 py-1 text-xs font-extrabold text-white ${p.mine ? 'bg-info' : 'bg-warn'}`}
            >
              {p.label}
            </span>
          </AdvancedMarker>
        ))}
      </Map>
    </APIProvider>
  );
}
