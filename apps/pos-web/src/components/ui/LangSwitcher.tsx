import { LANGS, type Lang } from '@pos/shared';
import { dictionaries, LANG_SHORT } from '@pos/shared/i18n';
import { cn } from './cn';

export interface LangSwitcherProps {
  value: Lang;
  onChange: (l: Lang) => void;
  langs?: readonly Lang[];
  /** Nama grup untuk pembaca layar (mis. "Bahasa" dalam bahasa aktif). */
  label: string;
  /** Versi ringkas untuk header (40×44 px). */
  compact?: boolean;
  /** Isi lebar penuh (4 tombol sama besar) — lembar Lainnya & layar login. */
  block?: boolean;
}

/** Pilih bahasa (ID / EN / ខ្មែរ / 中文) — tombol segmen M3; tiap tombol diberi nama bahasa lengkap. */
export function LangSwitcher({ value, onChange, langs = LANGS, label, compact, block }: LangSwitcherProps) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn('flex shrink-0 overflow-hidden rounded-full border border-outline', block && 'w-full')}
    >
      {langs.map((l, i) => (
        <button
          key={l}
          type="button"
          role="radio"
          lang={l === 'kh' ? 'km' : l === 'zh' ? 'zh-Hans' : l}
          aria-checked={value === l}
          aria-label={dictionaries[l].lang[l]}
          onClick={() => onChange(l)}
          className={cn(
            'state-layer text-label-large',
            compact ? 'min-h-11 min-w-10 px-2' : 'min-h-12 min-w-12 px-3',
            block && 'flex-1',
            i > 0 && 'border-l border-outline',
            l === 'kh' && 'font-khmer',
            l === 'zh' && 'font-sc',
            value === l ? 'bg-secondary-container text-on-secondary-container' : 'text-on-surface',
          )}
        >
          {LANG_SHORT[l]}
        </button>
      ))}
    </div>
  );
}
