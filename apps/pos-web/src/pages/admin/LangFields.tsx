/** Isian nama 4 bahasa + tombol "Terjemahkan otomatis" (Gemini / mock). */
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { LANGS, type Lang, type LocalizedText } from '@pos/shared';
import { useToast } from '../../components/ui';
import { api, errorMessage } from '../../lib/api';

export const LANG_FIELD_LABEL: Record<Lang, string> = {
  id: 'Indonesia',
  en: 'English',
  kh: 'ខ្មែរ (Khmer)',
  zh: '中文 (Mandarin)',
};

export type Loc = { id: string; en?: string; kh?: string; zh?: string };

/** Panggil /admin/translate untuk beberapa teks sekaligus; isi bahasa yang kosong saja. */
export function useAutoTranslate() {
  const { t } = useTranslation();
  const toast = useToast();
  return useMutation({
    mutationFn: async (entries: { key: string; text: Loc }[]) => {
      const valid = entries.filter((e) => e.text.id.trim());
      if (!valid.length) return { map: new Map<string, LocalizedText>(), provider: 'mock' as const };
      const res = await api.call('adminTranslate', {
        body: { entries: valid.map((e) => ({ key: e.key, text: { ...e.text, id: e.text.id.trim() } })) },
      });
      return { map: new Map(res.entries.map((e) => [e.key, e.text])), provider: res.provider };
    },
    onSuccess: (r) => {
      if (r.provider === 'none') toast.error(t('menux.translateFailed'));
      else toast.success(r.provider === 'mock' ? t('menux.translatedMock') : t('menux.translated'));
    },
    onError: (e) => toast.error(errorMessage(e, t)),
  });
}

/** Sisa mode uji lama ("[en] Nasi") dianggap kosong supaya diterjemahkan ulang. */
export const isMockText = (v: string | undefined) => !!v && /^\[(en|kh|zh)\]\s/.test(v);

/** Gabungkan hasil terjemahan ke teks: hanya bahasa yang kosong; kembalikan bahasa yang terisi otomatis. */
export function mergeTranslation(cur: Loc, tr: LocalizedText | undefined): { text: Loc; auto: Lang[] } {
  if (!tr) return { text: cur, auto: [] };
  const text: Loc = { ...cur };
  const auto: Lang[] = [];
  for (const l of LANGS) {
    if (l === 'id') continue;
    if ((!cur[l]?.trim() || isMockText(cur[l])) && tr[l]?.trim()) {
      text[l] = tr[l];
      auto.push(l);
    }
  }
  return { text, auto };
}

export function LangInputs({
  value,
  onChange,
  auto,
  idPrefix,
  big,
  multiline,
}: {
  value: Loc;
  onChange: (v: Loc, changedLang: Lang) => void;
  auto: Lang[];
  idPrefix: string;
  big?: boolean;
  /** Teks panjang (deskripsi): kotak multi-baris, maks 1000 karakter. */
  multiline?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <>
      {LANGS.map((l) => (
        <div key={l} className="flex flex-col gap-1">
          <label htmlFor={`${idPrefix}-${l}`} className="text-label-large text-on-surface-variant">
            {LANG_FIELD_LABEL[l]}
            {l !== 'id' && auto.includes(l) ? (
              <span className="font-medium text-tertiary"> · {t('menux.auto')}</span>
            ) : null}
          </label>
          {multiline ? (
            <textarea
              id={`${idPrefix}-${l}`}
              lang={l === 'kh' ? 'km' : l}
              value={value[l] ?? ''}
              maxLength={1000}
              rows={2}
              onChange={(e) => onChange({ ...value, [l]: e.target.value }, l)}
              className={`resize-y rounded-xs border border-outline bg-surface-container-lowest px-4 py-3 text-body-large outline-primary focus:border-primary focus:outline-1 ${l === 'kh' ? 'font-khmer' : l === 'zh' ? 'font-sc' : ''}`}
            />
          ) : (
            <input
              id={`${idPrefix}-${l}`}
              lang={l === 'kh' ? 'km' : l}
              value={value[l] ?? ''}
              maxLength={200}
              onChange={(e) => onChange({ ...value, [l]: e.target.value }, l)}
              className={`h-14 rounded-xs border border-outline bg-surface-container-lowest px-4 text-body-large outline-primary focus:border-primary focus:outline-1 ${big ? 'text-title-medium' : ''} ${l === 'kh' ? 'font-khmer' : l === 'zh' ? 'font-sc' : ''}`}
            />
          )}
        </div>
      ))}
    </>
  );
}

/** Bahasa yang masih kosong (atau sisa teks uji "[en] …"). */
export function missingLangs(v: Loc): Lang[] {
  return LANGS.filter((l) => l !== 'id' && (!v[l]?.trim() || isMockText(v[l])));
}

/**
 * Saat menyimpan: terjemahkan otomatis semua teks yang bahasanya masih kosong (satu panggilan).
 * Gagal / tanpa internet → teks dikembalikan apa adanya (tetap bisa disimpan).
 */
export async function fillMissing<K extends string>(texts: Record<K, Loc>): Promise<Record<K, Loc>> {
  const keys = (Object.keys(texts) as K[]).filter((k) => texts[k].id.trim() && missingLangs(texts[k]).length);
  if (!keys.length) return texts;
  const res = await api
    .call('adminTranslate', {
      body: { entries: keys.map((k) => ({ key: k, text: { ...texts[k], id: texts[k].id.trim() } })) },
    })
    .catch(() => null);
  if (!res || res.provider === 'none') return texts;
  const out = { ...texts };
  for (const e of res.entries) {
    const k = e.key as K;
    if (out[k]) out[k] = mergeTranslation(out[k], e.text).text;
  }
  return out;
}

/** Ringkasan satu baris: "EN: Fried egg · ខ្មែរ: … · 中文: …" atau null bila belum ada terjemahan. */
export function langSummary(v: Loc): string | null {
  const parts = (['en', 'kh', 'zh'] as const)
    .filter((l) => v[l]?.trim() && !isMockText(v[l]))
    .map((l) => `${l === 'en' ? 'EN' : l === 'kh' ? 'ខ្មែរ' : '中文'}: ${v[l]}`);
  return parts.length ? parts.join(' · ') : null;
}

export function cleanLoc(v: Loc): LocalizedText {
  const out: LocalizedText = { id: v.id.trim() };
  for (const l of ['en', 'kh', 'zh'] as const) if (v[l]?.trim()) out[l] = v[l]!.trim();
  return out;
}
