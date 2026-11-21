/**
 * Gemini (@google/genai): terjemahan menu & tanya-jawab bot Telegram.
 * Tanpa GEMINI_API_KEY → mode mock deterministik (test & dev offline).
 */
import { GoogleGenAI } from '@google/genai';
import type { FastifyInstance } from 'fastify';
import { formatMoney, LANGS, tl, type Lang, type LocalizedText, type Settings } from '@pos/shared';
import { getSettings } from '../../lib/settings';
import { loadItems, loadOptionGroups, listCategories } from '../menu/service';

let client: GoogleGenAI | null = null;
let clientKey: string | null = null;
function genai(app: FastifyInstance): GoogleGenAI | null {
  const key = app.config.GEMINI_API_KEY;
  if (!key) return null;
  if (!client || clientKey !== key) {
    client = new GoogleGenAI({ apiKey: key });
    clientKey = key;
  }
  return client;
}

const LANG_NAMES: Record<Lang, string> = {
  id: 'Indonesian',
  en: 'English',
  kh: 'Khmer (Cambodian)',
  zh: 'Simplified Chinese',
};

async function generateJson<T>(app: FastifyInstance, system: string, prompt: string): Promise<T> {
  const ai = genai(app);
  if (!ai) throw new Error('gemini disabled');
  const res = await ai.models.generateContent({
    model: app.config.GEMINI_MODEL,
    contents: prompt,
    config: { systemInstruction: system, responseMimeType: 'application/json', temperature: 0.2 },
  });
  const text = res.text ?? '';
  return JSON.parse(text) as T;
}

export function isQuotaError(err: unknown): boolean {
  const e = err as { status?: number; message?: string };
  return e?.status === 429 || /429|quota|RESOURCE_EXHAUSTED/i.test(e?.message ?? '');
}

// ---------- Terjemahan ----------
export interface TranslateEntry {
  key: string;
  text: LocalizedText;
  overwrite: boolean;
}

/** Mock: teks Indonesia diberi awalan "[en] …". */
export function mockTranslate(text: string, lang: Lang): string {
  return `[${lang}] ${text}`;
}

/**
 * Isi bahasa target yang kosong (atau semua bila overwrite) dari teks `id`.
 * Bahasa yang sudah terisi (diedit manual) tidak disentuh kecuali overwrite.
 */
export async function translateEntries(
  app: FastifyInstance,
  entries: TranslateEntry[],
  targets: Lang[] = ['en', 'kh', 'zh'],
): Promise<{ entries: { key: string; text: LocalizedText }[]; provider: 'gemini' | 'mock' }> {
  const langs = targets.filter((l) => l !== 'id');
  const jobs = entries.map((e) => ({
    key: e.key,
    source: e.text.id,
    need: langs.filter((l) => e.overwrite || !e.text[l]?.trim()),
  }));
  const pending = jobs.filter((j) => j.need.length);
  let provider: 'gemini' | 'mock' = 'mock';
  let translated: Record<string, Partial<Record<Lang, string>>> = {};
  if (pending.length && genai(app)) {
    try {
      const system =
        'You translate short Indonesian restaurant menu texts (dish names, option names, categories). ' +
        'Keep proper dish names recognizable (e.g. "Pempek"), be concise, no quotes. ' +
        'Reply ONLY with JSON: {"<key>": {"<lang>": "<translation>"}} using the language codes given ' +
        `(${langs.map((l) => `${l}=${LANG_NAMES[l]}`).join(', ')}).`;
      const prompt = JSON.stringify(pending.map((j) => ({ key: j.key, text: j.source, langs: j.need })));
      translated = await generateJson(app, system, prompt);
      provider = 'gemini';
    } catch (err) {
      app.log.warn({ err: (err as Error).message }, 'Gemini translate gagal, pakai mock');
      translated = {};
      provider = 'mock';
    }
  }
  return {
    provider,
    entries: entries.map((e) => {
      const job = jobs.find((j) => j.key === e.key)!;
      const out: LocalizedText = { ...e.text };
      for (const l of job.need) {
        const v = provider === 'gemini' ? translated[e.key]?.[l] : undefined;
        out[l] = (typeof v === 'string' && v.trim() ? v.trim() : mockTranslate(e.text.id, l)).slice(0, 200);
      }
      return { key: e.key, text: out };
    }),
  };
}

// ---------- Tanya-jawab ----------
/** Konteks menu untuk AI: nama, harga, opsi, habis, ai_info, jam buka. Tanpa data pelanggan. */
export async function buildMenuContext(app: FastifyInstance, settings?: Settings): Promise<string> {
  const s = settings ?? (await getSettings(app.db));
  const [cats, items, groups] = await Promise.all([
    listCategories(app.db),
    loadItems(app.db),
    loadOptionGroups(app.db),
  ]);
  const cur = s.currency.main;
  const lines: string[] = [
    `Restaurant: ${s.profile.name} (${s.profile.address}). Opening hours: ${s.hours.open}-${s.hours.close} (Asia/Phnom_Penh).`,
    `Currency: ${cur}. Delivery minimum order: ${formatMoney(s.delivery.minOrder, cur)}; delivery fee: ${formatMoney(s.delivery.defaultFee, cur)}.`,
    'Orders are placed ONLY through the Mini App (menu button). Payment: cash on delivery or ABA transfer.',
    'MENU:',
  ];
  for (const c of cats) {
    lines.push(`# ${tl(c.name, 'id')} / ${tl(c.name, 'en')}`);
    for (const i of items.filter((x) => x.categoryId === c.id)) {
      const names = LANGS.map((l) => i.name[l])
        .filter(Boolean)
        .join(' / ');
      const opts = i.optionGroupIds
        .map((gid) => groups.find((g) => g.id === gid))
        .filter((g): g is NonNullable<typeof g> => !!g)
        .map(
          (g) =>
            `${tl(g.name, 'en')}${g.required ? ' (required)' : ''}: ` +
            g.options
              .map(
                (o) =>
                  `${tl(o.name, 'en')}${o.priceDelta ? ` +${formatMoney(o.priceDelta, cur)}` : ''}${o.available ? '' : ' [SOLD OUT]'}`,
              )
              .join(', '),
        )
        .join('; ');
      lines.push(
        `- ${names}: ${formatMoney(i.prices.store, cur)}${i.available ? '' : ' [SOLD OUT today]'}` +
          (opts ? ` | options: ${opts}` : '') +
          (i.aiInfo ? ` | info: ${i.aiInfo}` : ''),
      );
    }
  }
  return lines.join('\n');
}

export interface AiAnswer {
  text: string;
  /** true = kirim balasan cadangan & teruskan ke grup admin. */
  forward: boolean;
  reason: 'ok' | 'unsure' | 'quota' | 'disabled' | 'error';
}

export const FALLBACK_REPLY: Record<Lang, string> = {
  id: 'Maaf, pertanyaan Anda sudah kami teruskan ke admin. Mohon tunggu balasan sebentar ya 🙏',
  en: 'Sorry, we have forwarded your question to our staff. Please wait a moment for a reply 🙏',
  kh: 'សូមអភ័យទោស យើងបានបញ្ជូនសំណួររបស់អ្នកទៅបុគ្គលិកហើយ។ សូមរង់ចាំបន្តិច 🙏',
  zh: '抱歉，您的问题已转给工作人员，请稍候回复 🙏',
};

export async function answerQuestion(app: FastifyInstance, question: string, lang: Lang): Promise<AiAnswer> {
  const settings = await getSettings(app.db);
  if (!settings.ai.enabled || !genai(app))
    return { text: FALLBACK_REPLY[lang], forward: true, reason: 'disabled' };
  try {
    const context = await buildMenuContext(app, settings);
    const system =
      'You are the friendly assistant of a restaurant on Telegram. Answer ONLY questions about the menu, prices, ' +
      'options, availability, opening hours, delivery and how to order, using ONLY the context below. ' +
      'Never take or create orders (tell the customer to use the Mini App menu button). Never ask for or reveal personal data. ' +
      `Reply in ${LANG_NAMES[lang]} (or the language the customer used), short and polite. ` +
      'If the question is off-topic, a complaint, about an existing order, or you are not sure, set "confident" to false. ' +
      'Reply ONLY with JSON {"answer": string, "confident": boolean}.\n\nCONTEXT:\n' +
      context;
    const r = await generateJson<{ answer?: string; confident?: boolean }>(
      app,
      system,
      question.slice(0, 1000),
    );
    if (!r.answer || r.confident === false)
      return { text: FALLBACK_REPLY[lang], forward: true, reason: 'unsure' };
    return { text: r.answer.slice(0, 3500), forward: false, reason: 'ok' };
  } catch (err) {
    const quota = isQuotaError(err);
    app.log.warn({ err: (err as Error).message, quota }, 'Gemini answer gagal');
    return { text: FALLBACK_REPLY[lang], forward: true, reason: quota ? 'quota' : 'error' };
  }
}
