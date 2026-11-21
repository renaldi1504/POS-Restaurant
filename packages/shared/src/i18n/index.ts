import type { Lang } from '../enums';
import { en } from './en';
import { id, type Dict } from './id';
import { kh } from './kh';
import { zh } from './zh';

export { en, id, kh, zh };
export type { Dict };
export * from './types';

export const dictionaries = { id, en, kh, zh } as const;

/**
 * Resource siap pakai untuk i18next:
 *   i18n.init({ resources: i18nResources, lng: 'id', fallbackLng: I18N_FALLBACK })
 */
export const i18nResources = {
  id: { translation: id },
  en: { translation: en },
  kh: { translation: kh },
  zh: { translation: zh },
} as const;

/** kh/zh → en → id untuk kunci POS yang belum diterjemahkan. */
export const I18N_FALLBACK: Record<Lang | 'default', Lang[]> = {
  id: [],
  en: ['id'],
  kh: ['en', 'id'],
  zh: ['en', 'id'],
  default: ['id'],
};

/** Nama font per bahasa (Noto Sans Khmer / SC untuk aksara non-Latin). */
export const LANG_FONT_CLASS: Record<Lang, string> = {
  id: 'font-sans',
  en: 'font-sans',
  kh: 'font-khmer',
  zh: 'font-sc',
};

/** Atribut `lang` HTML yang benar (kode ISO; 'kh' internal = 'km'). */
export const HTML_LANG: Record<Lang, string> = { id: 'id', en: 'en', kh: 'km', zh: 'zh-Hans' };
