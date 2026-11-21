import { z } from 'zod';
import { LANGS, type Lang } from './enums';

/**
 * Teks multi-bahasa yang disimpan sebagai JSONB `{id,en,kh,zh}`.
 * `id` wajib; bahasa lain opsional (kosong → fallback ke `id`).
 */
export const LocalizedText = z.object({
  id: z.string().trim().min(1).max(200),
  en: z.string().max(200).optional(),
  kh: z.string().max(200).optional(),
  zh: z.string().max(200).optional(),
});
export type LocalizedText = z.infer<typeof LocalizedText>;

/** Teks panjang (deskripsi) — boleh kosong semua. */
export const LocalizedLongText = z.object({
  id: z.string().max(1000).optional(),
  en: z.string().max(1000).optional(),
  kh: z.string().max(1000).optional(),
  zh: z.string().max(1000).optional(),
});
export type LocalizedLongText = z.infer<typeof LocalizedLongText>;

export type LocalizedLike = Partial<Record<Lang, string | null | undefined>> | null | undefined;

/**
 * Ambil teks sesuai bahasa, fallback ke `id`, lalu bahasa pertama yang terisi.
 * tl({id:'Ayam Goreng', en:'Fried Chicken'}, 'en') → 'Fried Chicken'
 * tl({id:'Ayam Goreng'}, 'kh') → 'Ayam Goreng'
 */
export function tl(text: LocalizedLike, lang: Lang | string | undefined): string {
  if (!text) return '';
  const l = (lang ?? 'id') as Lang;
  const v = text[l];
  if (v && v.trim()) return v;
  if (text.id && text.id.trim()) return text.id;
  for (const k of LANGS) {
    const x = text[k];
    if (x && x.trim()) return x;
  }
  return '';
}

/** Alias sesuai brief: `t(jsonbName, lang)`. */
export const t = tl;

/** Semua varian bahasa (untuk pencarian live di semua bahasa). */
export function allVariants(text: LocalizedLike): string[] {
  if (!text) return [];
  return LANGS.map((l) => text[l]).filter((v): v is string => !!v && !!v.trim());
}

/** Normalisasi untuk pencarian: huruf kecil, tanpa diakritik. */
export function normalizeSearch(s: string): string {
  return s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/** Cocokkan query ke salah satu varian bahasa (substring, tanpa beda huruf besar/kecil). */
export function matchesLocalized(query: string, ...texts: LocalizedLike[]): boolean {
  const q = normalizeSearch(query);
  if (!q) return true;
  return texts.some((tx) => allVariants(tx).some((v) => normalizeSearch(v).includes(q)));
}

/** Bahasa yang masih kosong (untuk tombol "Terjemahkan otomatis"). */
export function missingLangs(text: LocalizedLike): Lang[] {
  return LANGS.filter((l) => !text?.[l]?.trim());
}
