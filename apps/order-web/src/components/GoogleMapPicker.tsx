/// <reference types="google.maps" />
/**
 * Peta Google + pin geser + Places Autocomplete. Dimuat lazy hanya bila VITE_GOOGLE_MAPS_API_KEY diisi.
 */
import { APIProvider, Map, Marker, useMap, useMapsLibrary } from '@vis.gl/react-google-maps';
import { useEffect, useRef, type ReactNode } from 'react';
import { HTML_LANG } from '@pos/shared/i18n';
import type { Lang } from '@pos/shared';
import { SearchIcon } from './Icons';

export interface LatLng {
  lat: number;
  lng: number;
}

export interface GoogleMapPickerProps {
  apiKey: string;
  lang: Lang;
  center: LatLng;
  point: LatLng | null;
  onPick: (p: LatLng, text?: string) => void;
  mapLabel: string;
  pinLabel: string;
  dragHint: string;
  searchLabel: string;
  /** Diletakkan di antara peta dan kolom cari (tombol "Pakai lokasi saya"). */
  children?: ReactNode;
}

function useReverseGeocode() {
  const lib = useMapsLibrary('geocoding');
  const ref = useRef<google.maps.Geocoder | null>(null);
  useEffect(() => {
    if (lib && !ref.current) ref.current = new lib.Geocoder();
  }, [lib]);
  return async (p: LatLng): Promise<string | undefined> => {
    if (!ref.current) return undefined;
    try {
      const res = await ref.current.geocode({ location: p });
      return res.results[0]?.formatted_address;
    } catch {
      return undefined;
    }
  };
}

function PanTo({ point }: { point: LatLng | null }) {
  const map = useMap();
  useEffect(() => {
    if (map && point) map.panTo(point);
  }, [map, point]);
  return null;
}

function PlacesSearch({ label, onPick }: { label: string; onPick: GoogleMapPickerProps['onPick'] }) {
  const places = useMapsLibrary('places');
  const input = useRef<HTMLInputElement>(null);
  const pickRef = useRef(onPick);
  pickRef.current = onPick;
  useEffect(() => {
    if (!places || !input.current) return;
    const ac = new places.Autocomplete(input.current, {
      fields: ['geometry', 'formatted_address', 'name'],
      componentRestrictions: { country: 'kh' },
    });
    const l = ac.addListener('place_changed', () => {
      const pl = ac.getPlace();
      const loc = pl.geometry?.location;
      if (!loc) return;
      const name = pl.name && !pl.formatted_address?.startsWith(pl.name) ? `${pl.name}, ` : '';
      pickRef.current({ lat: loc.lat(), lng: loc.lng() }, `${name}${pl.formatted_address ?? ''}`.trim());
    });
    return () => l.remove();
  }, [places]);
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-3.5 text-on-surface-variant">
        <SearchIcon size={18} />
      </span>
      <input
        ref={input}
        type="search"
        aria-label={label}
        placeholder={label}
        className="h-12 w-full rounded-md border border-outline-variant bg-surface-container-lowest pl-10 pr-3"
      />
    </div>
  );
}

function MapArea({
  center,
  point,
  onPick,
  mapLabel,
  pinLabel,
  dragHint,
}: Omit<GoogleMapPickerProps, 'apiKey' | 'lang' | 'searchLabel' | 'children'>) {
  const reverse = useReverseGeocode();
  const pick = async (p: LatLng) => {
    onPick(p);
    const text = await reverse(p);
    if (text) onPick(p, text);
  };
  return (
    <div className="relative h-[250px] shrink-0" role="region" aria-label={mapLabel}>
      <Map
        defaultCenter={point ?? center}
        defaultZoom={point ? 17 : 14}
        gestureHandling="greedy"
        disableDefaultUI
        zoomControl
        clickableIcons={false}
        onClick={(e) => {
          const ll = e.detail.latLng;
          if (ll) void pick(ll);
        }}
        style={{ width: '100%', height: '100%' }}
      >
        {point ? (
          <Marker
            position={point}
            draggable
            title={pinLabel}
            onDragEnd={(e) => {
              const ll = e.latLng;
              if (ll) void pick({ lat: ll.lat(), lng: ll.lng() });
            }}
          />
        ) : null}
        <PanTo point={point} />
      </Map>
      <span className="pointer-events-none absolute bottom-2.5 left-2.5 rounded-sm bg-surface-container-lowest/90 px-2 py-1 text-label-medium text-on-surface-variant">
        {dragHint}
      </span>
    </div>
  );
}

export default function GoogleMapPicker({
  apiKey,
  lang,
  searchLabel,
  children,
  ...rest
}: GoogleMapPickerProps) {
  return (
    <APIProvider apiKey={apiKey} language={HTML_LANG[lang]} region="KH">
      <MapArea {...rest} />
      <div className="flex flex-col gap-2.5 px-3.5 pt-3">
        {children}
        <PlacesSearch label={searchLabel} onPick={rest.onPick} />
      </div>
    </APIProvider>
  );
}
