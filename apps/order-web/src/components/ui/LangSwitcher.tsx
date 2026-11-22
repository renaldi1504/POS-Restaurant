import { useTranslation } from 'react-i18next';
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
  /** `onBrand` = di atas pita sampul hijau tua (wadah kaca gelap, pilihan aktif putih). */
  tone?: 'default' | 'onBrand';
}

const SHORT: Record<Lang, string> = { id: 'ID', en: 'EN', kh: 'ខ្មែរ', zh: '中文' };

/** Pilih bahasa (ID / EN / ខ្មែរ / 中文) — tombol segmen M3. */
export function LangSwitcher({
  value,
  onChange,
  langs = LANGS,
  label,
  compact,
  tone = 'default',
}: LangSwitcherProps) {
  const brand = tone === 'onBrand';
  const { t } = useTranslation();
  return (
    <div
      role="radiogroup"
      aria-label={label ?? t('common.language')}
      className={cn(
        'flex shrink-0 overflow-hidden rounded-full',
        brand
          ? 'gap-0.5 bg-black/25 p-0.5 ring-1 ring-on-primary/25 backdrop-blur-sm'
          : 'border border-outline',
      )}
    >
      {langs.map((l, i) => (
        <button
          key={l}
          type="button"
          role="radio"
          aria-checked={value === l}
          aria-label={dictionaries[l].lang[l]}
          onClick={() => onChange(l)}
          className={cn(
            'state-layer text-label-large',
            compact ? 'min-h-11 min-w-10 px-2' : 'min-h-12 min-w-12 px-3',
            brand ? 'rounded-full transition-colors' : i > 0 && 'border-l border-outline',
            l === 'kh' && 'font-khmer',
            l === 'zh' && 'font-sc',
            brand
              ? value === l
                ? 'bg-surface-container-lowest font-semibold text-primary'
                : 'text-on-primary'
              : value === l
                ? 'bg-secondary-container text-on-secondary-container'
                : 'text-on-surface',
          )}
        >
          {SHORT[l]}
        </button>
      ))}
    </div>
  );
}
