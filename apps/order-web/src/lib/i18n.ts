import i18n, { type Resource } from 'i18next';
import { initReactI18next } from 'react-i18next';
import { LANGS, type Lang } from '@pos/shared';
import { HTML_LANG, I18N_FALLBACK, i18nResources } from '@pos/shared/i18n';
import { webStrings } from './strings';

const STORAGE_KEY = 'order.lang';

function safeLocal(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

export function storedLang(): Lang | null {
  try {
    const v = safeLocal()?.getItem(STORAGE_KEY) ?? null;
    return v && (LANGS as readonly string[]).includes(v) ? (v as Lang) : null;
  } catch {
    return null;
  }
}

/** Ganti bahasa UI pelanggan (disimpan di perangkat). */
export function setLang(lang: Lang): void {
  try {
    safeLocal()?.setItem(STORAGE_KEY, lang);
  } catch {
    /* mode privat */
  }
  void i18n.changeLanguage(lang);
}

/** Kode bahasa (browser / Telegram `language_code`) → Lang (km → kh, zh-* → zh). */
export function langFromCode(code: string | undefined | null): Lang | null {
  const c = (code ?? '').toLowerCase();
  if (!c) return null;
  if (c.startsWith('km') || c.startsWith('kh')) return 'kh';
  if (c.startsWith('zh')) return 'zh';
  if (c.startsWith('en')) return 'en';
  if (c.startsWith('id') || c.startsWith('in') || c.startsWith('ms')) return 'id';
  return null;
}

/** Bahasa awal dari browser. */
export function detectBrowserLang(): Lang {
  const nav = typeof navigator !== 'undefined' ? navigator.language : 'id';
  return langFromCode(nav) ?? 'id';
}

/** Terapkan bahasa dari Telegram bila pengguna belum pernah memilih sendiri. */
export function applyTelegramLang(code: string | undefined): void {
  if (storedLang()) return;
  const l = langFromCode(code);
  if (l && l !== i18n.language) void i18n.changeLanguage(l);
}

export function currentLang(): Lang {
  const l = i18n.language as Lang;
  return (LANGS as readonly string[]).includes(l) ? l : 'id';
}

i18n.on('languageChanged', (lng) => {
  if (typeof document !== 'undefined') document.documentElement.lang = HTML_LANG[lng as Lang] ?? 'id';
});

const resources = Object.fromEntries(
  LANGS.map((l) => [l, { translation: { ...i18nResources[l].translation, web: webStrings[l] } }]),
) as unknown as Resource;

void i18n.use(initReactI18next).init({
  resources,
  lng: storedLang() ?? detectBrowserLang(),
  fallbackLng: I18N_FALLBACK,
  interpolation: { escapeValue: false },
  returnNull: false,
  showSupportNotice: false,
});

export default i18n;
