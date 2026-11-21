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
    onSuccess: (r) =>
      toast.success(r.provider === 'mock' ? t('menux.translatedMock') : t('menux.translated')),
    onError: (e) => toast.error(errorMessage(e, t)),
  });
}

/** Gabungkan hasil terjemahan ke teks: hanya bahasa yang kosong; kembalikan bahasa yang terisi otomatis. */
export function mergeTranslation(cur: Loc, tr: LocalizedText | undefined): { text: Loc; auto: Lang[] } {
  if (!tr) return { text: cur, auto: [] };
  const text: Loc = { ...cur };
  const auto: Lang[] = [];
  for (const l of LANGS) {
    if (l === 'id') continue;
    if (!cur[l]?.trim() && tr[l]?.trim()) {
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
}: {
  value: Loc;
  onChange: (v: Loc, changedLang: Lang) => void;
  auto: Lang[];
  idPrefix: string;
  big?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <>
      {LANGS.map((l) => (
        <div key={l} className="flex flex-col gap-1">
          <label htmlFor={`${idPrefix}-${l}`} className="text-[13px] font-bold text-muted">
            {LANG_FIELD_LABEL[l]}
            {l !== 'id' && auto.includes(l) ? (
              <span className="font-semibold text-info"> · {t('menux.auto')}</span>
            ) : null}
          </label>
          <input
            id={`${idPrefix}-${l}`}
            lang={l === 'kh' ? 'km' : l}
            value={value[l] ?? ''}
            maxLength={200}
            onChange={(e) => onChange({ ...value, [l]: e.target.value }, l)}
            className={`h-12 rounded-xl border border-line-strong px-3 ${big ? 'text-[17px]' : ''} ${l === 'kh' ? 'font-khmer' : l === 'zh' ? 'font-sc' : ''}`}
          />
        </div>
      ))}
    </>
  );
}

export function cleanLoc(v: Loc): LocalizedText {
  const out: LocalizedText = { id: v.id.trim() };
  for (const l of ['en', 'kh', 'zh'] as const) if (v[l]?.trim()) out[l] = v[l]!.trim();
  return out;
}
