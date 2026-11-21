import { LANGS, type Lang } from '@pos/shared';
import { dictionaries } from '@pos/shared/i18n';
import { cn } from './cn';

export interface LangSwitcherProps {
  value: Lang;
  onChange: (l: Lang) => void;
  langs?: readonly Lang[];
  label?: string;
  /** Versi ringkas untuk header (40×44 px). */
  compact?: boolean;
}

const SHORT: Record<Lang, string> = { id: 'ID', en: 'EN', kh: 'ខ្មែរ', zh: '中文' };

/** Pilih bahasa (ID / EN / ខ្មែរ / 中文) — tombol besar. */
export function LangSwitcher({
  value,
  onChange,
  langs = LANGS,
  label = 'Bahasa',
  compact,
}: LangSwitcherProps) {
  return (
    <div role="radiogroup" aria-label={label} className={cn('flex shrink-0', compact ? 'gap-1' : 'gap-1.5')}>
      {langs.map((l) => (
        <button
          key={l}
          type="button"
          role="radio"
          aria-checked={value === l}
          aria-label={dictionaries[l].lang[l]}
          onClick={() => onChange(l)}
          className={cn(
            compact
              ? 'min-h-11 min-w-10 rounded-[10px] px-1.5 text-[13px] font-bold'
              : 'min-h-11 min-w-12 rounded-xl px-3 text-[15px] font-bold',
            l === 'kh' && 'font-khmer',
            l === 'zh' && 'font-sc',
            value === l ? 'bg-ink text-white' : 'border border-line-strong bg-white text-ink',
          )}
        >
          {SHORT[l]}
        </button>
      ))}
    </div>
  );
}
