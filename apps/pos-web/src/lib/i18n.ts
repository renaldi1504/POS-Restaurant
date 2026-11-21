import i18n, { type Resource } from 'i18next';
import { initReactI18next } from 'react-i18next';
import { LANGS, type Lang } from '@pos/shared';
import { HTML_LANG, I18N_FALLBACK, i18nResources } from '@pos/shared/i18n';
import { extraEn, extraId, extraKh, extraZh } from '../i18n/extra';

const STORAGE_KEY = 'pos.lang';

export function isLang(v: unknown): v is Lang {
  return typeof v === 'string' && (LANGS as readonly string[]).includes(v);
}

/** Bahasa terakhir di perangkat ini (dipakai layar login sebelum ada user). */
export function storedLang(): Lang | null {
  try {
    const v = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    return isLang(v) ? v : null;
  } catch {
    return null;
  }
}

/**
 * Ganti bahasa UI di perangkat ini (localStorage + i18next + `<html lang>`). Untuk menyimpan juga ke akun
 * user yang login, pakai `useChangeLang()` (lib/useLang.ts).
 */
export function setLang(lang: Lang): void {
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    /* mode privat */
  }
  if (i18n.language !== lang) void i18n.changeLanguage(lang);
}

/** Bahasa UI aktif (id/en/kh/zh). */
export function currentLang(): Lang {
  return isLang(i18n.language) ? i18n.language : 'id';
}

function applyHtmlLang(lng: string) {
  if (typeof document !== 'undefined') document.documentElement.lang = HTML_LANG[lng as Lang] ?? 'id';
}
i18n.on('languageChanged', applyHtmlLang);

void i18n.use(initReactI18next).init({
  resources: i18nResources as unknown as Resource,
  lng: storedLang() ?? 'id',
  fallbackLng: I18N_FALLBACK,
  interpolation: { escapeValue: false },
  returnNull: false,
  showSupportNotice: false,
});

// Kamus tambahan pos-web (deep merge, tidak menimpa kunci shared).
i18n.addResourceBundle('id', 'translation', extraId, true, false);
i18n.addResourceBundle('en', 'translation', extraEn, true, false);
i18n.addResourceBundle('kh', 'translation', extraKh, true, false);
i18n.addResourceBundle('zh', 'translation', extraZh, true, false);
applyHtmlLang(i18n.language);

export default i18n;
