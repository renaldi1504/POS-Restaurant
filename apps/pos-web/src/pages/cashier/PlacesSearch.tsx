/**
 * Cari alamat dengan Google Places Autocomplete. Dimuat lazy HANYA bila VITE_GOOGLE_MAPS_API_KEY diisi,
 * sehingga bundle kasir tetap kecil (sama seperti peta driver & order-web).
 */
import { APIProvider, useMapsLibrary } from '@vis.gl/react-google-maps';
import { useEffect, useRef } from 'react';
import { HTML_LANG } from '@pos/shared/i18n';
import type { Lang } from '@pos/shared';
import { Icon } from '../../components/ui';

export interface PlacesSearchProps {
  apiKey: string;
  lang: Lang;
  label: string;
  onPick: (p: { lat: number; lng: number }, text: string) => void;
}

function Input({ label, onPick }: Omit<PlacesSearchProps, 'apiKey' | 'lang'>) {
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
      if (input.current) input.current.value = '';
    });
    return () => l.remove();
  }, [places]);
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-4 text-on-surface-variant">
        <Icon name="search" />
      </span>
      <input
        ref={input}
        type="search"
        aria-label={label}
        placeholder={label}
        className="h-14 w-full rounded-xs border border-outline bg-surface-container-lowest pl-12 pr-3 text-body-large outline-none focus:border-primary focus:outline-1 focus:outline-primary"
      />
    </div>
  );
}

export default function PlacesSearch({ apiKey, lang, ...rest }: PlacesSearchProps) {
  return (
    <APIProvider apiKey={apiKey} language={HTML_LANG[lang]} region="KH">
      <Input {...rest} />
    </APIProvider>
  );
}
