import i18n, { type Resource } from 'i18next';
import { initReactI18next } from 'react-i18next';
import { LANGS, type Lang } from '@pos/shared';
import { HTML_LANG, I18N_FALLBACK, i18nResources } from '@pos/shared/i18n';
import { extraEn, extraId, extraKh, extraZh } from '../i18n/extra';

const STORAGE_KEY = 'pos.lang';

export function storedLang(): Lang | null {
  const v = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
  return v && (LANGS as readonly string[]).includes(v) ? (v as Lang) : null;
}

/** Ganti bahasa UI (disimpan per perangkat — mis. layar dapur pakai kh). */
export function setLang(lang: Lang): void {
  localStorage.setItem(STORAGE_KEY, lang);
  void i18n.changeLanguage(lang);
}

i18n.on('languageChanged', (lng) => {
  if (typeof document !== 'undefined') document.documentElement.lang = HTML_LANG[lng as Lang] ?? 'id';
});

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

export default i18n;
