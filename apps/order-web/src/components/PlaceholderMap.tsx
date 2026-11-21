import { PinIcon } from './Icons';

/** Peta tiruan (tanpa kunci Google Maps) — tampilan mockup Alamat.dc.html. */
export function PlaceholderMap({
  label,
  pinLabel,
  note,
  point,
}: {
  label: string;
  pinLabel: string;
  note: string;
  point: { lat: number; lng: number } | null;
}) {
  return (
    <div
      role="img"
      aria-label={label}
      className="relative h-[200px] shrink-0 overflow-hidden bg-surface-container-highest"
      data-testid="placeholder-map"
    >
      <div className="absolute -left-5 -right-5 top-[60px] h-3.5 -rotate-[8deg] bg-surface-container-lowest" />
      <div className="absolute -left-5 -right-5 top-[150px] h-2.5 rotate-[4deg] bg-surface-container-lowest" />
      <div className="absolute -bottom-5 -top-5 left-[30%] w-3 rotate-[10deg] bg-surface-container-lowest" />
      <div className="absolute -bottom-5 -top-5 left-[72%] w-[9px] -rotate-[6deg] bg-surface-container-lowest" />
      <div className="absolute left-[42%] top-[90px] h-[50px] w-[70px] rounded-sm bg-surface-container-highest" />
      <div className="absolute left-6 top-[110px] h-10 w-[60px] rounded-sm bg-surface-container-highest" />
      <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-full flex-col items-center">
        <span className="mb-1 whitespace-nowrap rounded-sm bg-inverse-surface px-2.5 py-1 text-label-medium text-inverse-on-surface shadow-e1">
          {point ? `${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}` : pinLabel}
        </span>
        <PinIcon />
      </div>
      <span className="absolute bottom-2.5 left-2.5 right-2.5 rounded-sm bg-surface-container-lowest/90 px-2 py-1 text-label-medium text-on-surface-variant">
        {note}
      </span>
    </div>
  );
}
