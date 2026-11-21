/**
 * Gemini (@google/genai): terjemahan menu & tanya-jawab bot Telegram.
 * Tanpa GEMINI_API_KEY → terjemahan gratis MyMemory; mock "[en] …" hanya di test/dev offline.
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

/** Cadangan bila model di .env tidak tersedia (dihentikan Google) atau kuota gratisnya habis. */
export const MODEL_FALLBACKS = [
  'gemini-3.8-flash',
  'gemini-3.7-flash',
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
];
let workingModel: string | null = null;

/** Model tidak ada / dihentikan untuk pengguna baru → coba model berikutnya. */
export function isModelUnavailable(err: unknown): boolean {
  const e = err as { status?: number; message?: string };
  return (
    e?.status === 404 ||
    /NOT_FOUND|no longer available|is not found|not supported for generateContent|Unknown name/i.test(
      e?.message ?? '',
    )
  );
}

function parseJson<T>(raw: string | undefined): T {
  const text = (raw ?? '').trim();
  try {
    return JSON.parse(text) as T;
  } catch {
    // Kadang dibungkus ```json … ``` atau ada teks di luar JSON
    const m = /\{[\s\S]*\}/.exec(text);
    if (m) return JSON.parse(m[0]) as T;
    throw new Error(`Balasan Gemini bukan JSON: ${text.slice(0, 120)}`);
  }
}

async function generateJson<T>(app: FastifyInstance, system: string, prompt: string): Promise<T> {
  const ai = genai(app);
  if (!ai) throw new Error('gemini disabled');
  const configured = app.config.GEMINI_MODEL;
  const candidates = [...new Set([workingModel ?? configured, configured, ...MODEL_FALLBACKS])];
  let lastErr: unknown;
  for (const model of candidates) {
    try {
      const res = await ai.models.generateContent({
        model,
        contents: prompt,
        config: { systemInstruction: system, responseMimeType: 'application/json', temperature: 0.2 },
      });
      if (workingModel !== model) {
        if (model !== configured)
          app.log.warn(
            { configured, using: model },
            `Model Gemini "${configured}" tidak bisa dipakai, pakai "${model}"`,
          );
        workingModel = model;
      }
      return parseJson<T>(res.text);
    } catch (err) {
      lastErr = err;
      if (!isModelUnavailable(err) && !isQuotaError(err)) throw err;
      if (workingModel === model) workingModel = null;
    }
  }
  throw lastErr;
}

/** Model yang terakhir berhasil (untuk Tes AI). */
export function currentGeminiModel(app: FastifyInstance): string {
  return workingModel ?? app.config.GEMINI_MODEL;
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

export type TranslateProvider = 'gemini' | 'free' | 'mock' | 'none';

/** Mock: teks Indonesia diberi awalan "[en] …" — HANYA untuk test & dev offline, tidak pernah di production. */
export function mockTranslate(text: string, lang: Lang): string {
  return `[${lang}] ${text}`;
}

/** Sisa mock lama ("[en] Nasi") dianggap belum diterjemahkan. */
export function isMockText(v: string | undefined): boolean {
  return !!v && /^\[(en|kh|zh)\]\s/.test(v);
}

/** Kode bahasa MyMemory. */
const FREE_LANG: Record<Lang, string> = { id: 'id', en: 'en', kh: 'km', zh: 'zh-CN' };

/**
 * Terjemahan gratis tanpa API key: MyMemory (api.mymemory.translated.net), ±5.000 karakter/hari per IP
 * (50.000 bila TRANSLATE_EMAIL diisi). Dipakai bila Gemini tidak ada / gagal. Kembalikan null bila gagal.
 */
export async function freeTranslate(
  app: FastifyInstance,
  text: string,
  lang: Lang,
  fetchFn: typeof fetch = fetch,
): Promise<string | null> {
  try {
    const url = new URL('https://api.mymemory.translated.net/get');
    url.searchParams.set('q', text);
    url.searchParams.set('langpair', `id|${FREE_LANG[lang]}`);
    if (app.config.TRANSLATE_EMAIL) url.searchParams.set('de', app.config.TRANSLATE_EMAIL);
    const res = await fetchFn(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const body = (await res.json()) as {
      responseStatus?: number | string;
      responseData?: { translatedText?: string };
    };
    const out = body.responseData?.translatedText?.trim();
    if (Number(body.responseStatus) !== 200 || !out) return null;
    // MyMemory membalas pesan error/kuota sebagai teks berhuruf kapital
    if (/MYMEMORY WARNING|QUERY LENGTH LIMIT|INVALID LANGUAGE PAIR/i.test(out)) return null;
    return out;
  } catch (err) {
    app.log.warn({ err: (err as Error).message }, 'Terjemahan gratis (MyMemory) gagal');
    return null;
  }
}

/**
 * Isi bahasa target yang kosong (atau semua bila overwrite) dari teks `id`.
 * Bahasa yang sudah terisi (diedit manual) tidak disentuh kecuali overwrite.
 * Urutan: Gemini (bila ada key) → MyMemory gratis → di production dibiarkan kosong ('none');
 * di test/dev offline baru mock "[en] …".
 */
export async function translateEntries(
  app: FastifyInstance,
  entries: TranslateEntry[],
  targets: Lang[] = ['en', 'kh', 'zh'],
  deps: { fetchFn?: typeof fetch } = {},
): Promise<{ entries: { key: string; text: LocalizedText }[]; provider: TranslateProvider }> {
  const langs = targets.filter((l) => l !== 'id');
  const jobs = entries.map((e) => ({
    key: e.key,
    source: e.text.id,
    need: langs.filter((l) => e.overwrite || !e.text[l]?.trim() || isMockText(e.text[l])),
  }));
  const pending = jobs.filter((j) => j.need.length);
  const translated: Record<string, Partial<Record<Lang, string>>> = {};
  const used = new Set<TranslateProvider>();

  if (pending.length && genai(app)) {
    try {
      const system =
        'You translate short Indonesian restaurant menu texts (dish names, option names, categories). ' +
        'Keep proper dish names recognizable (e.g. "Pempek"), be concise, no quotes. ' +
        'Reply ONLY with JSON: {"<key>": {"<lang>": "<translation>"}} using the language codes given ' +
        `(${langs.map((l) => `${l}=${LANG_NAMES[l]}`).join(', ')}).`;
      const prompt = JSON.stringify(pending.map((j) => ({ key: j.key, text: j.source, langs: j.need })));
      const res = await generateJson<Record<string, Partial<Record<Lang, string>>>>(app, system, prompt);
      for (const [k, v] of Object.entries(res ?? {})) translated[k] = { ...v };
      used.add('gemini');
    } catch (err) {
      app.log.warn({ err: (err as Error).message }, 'Gemini translate gagal, coba terjemahan gratis');
    }
  }

  const ok = (v: unknown): v is string => typeof v === 'string' && !!v.trim();
  // Yang belum terisi (Gemini mati / gagal / bolong) → MyMemory gratis. Tidak dipakai saat test.
  if ((deps.fetchFn || !app.config.isTest) && app.config.TRANSLATE_FREE_ENABLED) {
    for (const j of pending) {
      for (const l of j.need) {
        if (ok(translated[j.key]?.[l])) continue;
        const v = await freeTranslate(app, j.source, l, deps.fetchFn);
        if (v) {
          (translated[j.key] ??= {})[l] = v;
          used.add('free');
        }
      }
    }
  }

  const allowMock = !app.config.isProd;
  let mocked = false;
  const out = entries.map((e) => {
    const job = jobs.find((j) => j.key === e.key)!;
    const text: LocalizedText = { ...e.text };
    for (const l of job.need) {
      const v = translated[e.key]?.[l];
      if (ok(v)) text[l] = v.trim().slice(0, 200);
      else if (allowMock) {
        text[l] = mockTranslate(e.text.id, l);
        mocked = true;
      } else if (isMockText(text[l])) delete text[l];
    }
    return { key: e.key, text };
  });
  const provider: TranslateProvider = used.has('gemini')
    ? 'gemini'
    : used.has('free')
      ? 'free'
      : mocked
        ? 'mock'
        : pending.length
          ? 'none'
          : 'gemini';
  return { provider, entries: out };
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
  reason: 'ok' | 'unsure' | 'quota' | 'disabled' | 'error' | 'lookup';
  /** Bahasa pesan pelanggan (deteksi Gemini / aksara), dipakai untuk membalas & notifikasi. */
  lang: Lang;
  /** Pesan error asli (diagnosa admin). */
  error?: string;
}

export const FALLBACK_REPLY: Record<Lang, string> = {
  id: 'Maaf, pertanyaan Anda sudah kami teruskan ke admin. Mohon tunggu balasan sebentar ya 🙏',
  en: 'Sorry, we have forwarded your question to our staff. Please wait a moment for a reply 🙏',
  kh: 'សូមអភ័យទោស យើងបានបញ្ជូនសំណួររបស់អ្នកទៅបុគ្គលិកហើយ។ សូមរង់ចាំបន្តិច 🙏',
  zh: '抱歉，您的问题已转给工作人员，请稍候回复 🙏',
};

const ID_WORDS =
  /\b(berapa|harga|ada|apa|mau|pesan|saya|aku|yang|tidak|nggak|gak|ga|bisa|enak|dong|kak|boleh|kapan|buka|tutup|antar|ongkir|pedas|minta|tolong|terima|kasih|sudah|belum|gimana|bagaimana|pakai|dan|atau|juga)\b/gi;
const EN_WORDS =
  /\b(how|much|price|what|do|you|have|is|are|open|close|delivery|the|can|i|want|order|menu|spicy|please|thanks|thank|when|where|does|any|with|and|or)\b/gi;

/**
 * Deteksi bahasa cepat dari aksara/kata (tanpa AI): Khmer → kh, Han → zh, Latin → id/en dari kata umum.
 * null = tidak yakin (mis. hanya emoji / satu kata nama menu).
 */
export function detectLang(text: string): Lang | null {
  const t = text.trim();
  if (!t) return null;
  if (/[ក-៿᧠-᧿]/.test(t)) return 'kh';
  if (/[一-鿿㐀-䶿]/.test(t)) return 'zh';
  const id = t.match(ID_WORDS)?.length ?? 0;
  const en = t.match(EN_WORDS)?.length ?? 0;
  if (id === 0 && en === 0) return null;
  if (id === en) return null;
  return id > en ? 'id' : 'en';
}

const PRICE_WORDS: Record<Lang, string> = { id: 'Harga', en: 'Price', kh: 'តម្លៃ', zh: '价格' };
const SOLD_OUT_WORDS: Record<Lang, string> = {
  id: 'habis hari ini',
  en: 'sold out today',
  kh: 'អស់ថ្ងៃនេះ',
  zh: '今日售罄',
};
const ORDER_HINT: Record<Lang, string> = {
  id: 'Tekan tombol "Pesan sekarang" untuk memesan 🙏',
  en: 'Tap "Order now" to place your order 🙏',
  kh: 'ចុច "កុម្ម៉ង់ឥឡូវ" ដើម្បីកុម្ម៉ង់ 🙏',
  zh: '点击“立即点餐”下单 🙏',
};

/**
 * Cadangan tanpa Gemini (key kosong / kuota habis): cari nama menu di pesan (semua bahasa) lalu balas
 * harga & opsinya. null bila tidak ada menu yang cocok.
 */
export async function menuLookupReply(
  app: FastifyInstance,
  question: string,
  lang: Lang,
): Promise<string | null> {
  const s = await getSettings(app.db);
  const [items, groups] = await Promise.all([loadItems(app.db), loadOptionGroups(app.db)]);
  const q = question.toLowerCase();
  const hits = items.filter((i) =>
    LANGS.some((l) => {
      const n = i.name[l]?.toLowerCase().trim();
      return !!n && n.length >= 3 && q.includes(n);
    }),
  );
  if (!hits.length) return null;
  const cur = s.currency.main;
  const lines = hits.slice(0, 8).map((i) => {
    const opts = i.optionGroupIds
      .map((gid) => groups.find((g) => g.id === gid))
      .filter((g): g is NonNullable<typeof g> => !!g)
      .map(
        (g) =>
          `  • ${tl(g.name, lang)}: ` +
          g.options
            .map((o) => `${tl(o.name, lang)}${o.priceDelta ? ` +${formatMoney(o.priceDelta, cur)}` : ''}`)
            .join(', '),
      );
    return [
      `🍽 ${tl(i.name, lang)} — ${PRICE_WORDS[lang]}: ${formatMoney(i.prices.store, cur)}${i.available ? '' : ` (${SOLD_OUT_WORDS[lang]})`}`,
      ...opts,
    ].join('\n');
  });
  return `${lines.join('\n\n')}\n\n${ORDER_HINT[lang]}`;
}

export async function answerQuestion(app: FastifyInstance, question: string, lang: Lang): Promise<AiAnswer> {
  const settings = await getSettings(app.db);
  const detected = detectLang(question) ?? lang;
  const fallback = async (reason: AiAnswer['reason'], error?: string): Promise<AiAnswer> => {
    const lookup = await menuLookupReply(app, question, detected).catch(() => null);
    if (lookup) return { text: lookup, forward: false, reason: 'lookup', lang: detected, error };
    return { text: FALLBACK_REPLY[detected], forward: true, reason, lang: detected, error };
  };
  if (!genai(app)) return fallback('disabled', 'GEMINI_API_KEY kosong di .env server');
  if (!settings.ai.enabled) return fallback('disabled', 'AI dimatikan di Pengaturan');
  try {
    const context = await buildMenuContext(app, settings);
    const system =
      'You are the friendly assistant of a restaurant on Telegram. Answer ONLY questions about the menu, dishes, prices, ' +
      'options, availability, opening hours, delivery and how to order, using ONLY the context below.\n' +
      'LANGUAGE: detect the language of the customer message and reply in THAT SAME language ' +
      '(Khmer → Khmer script, Chinese → Simplified Chinese, Indonesian → Indonesian, English → English; ' +
      `other languages → English). If unclear, use ${LANG_NAMES[detected]}. Use dish names in that language when the context has them.\n` +
      'PRICES: always state prices with the currency exactly as in the context. If the customer lists dishes/quantities ' +
      '(e.g. "2 fried chicken + 1 iced tea"), give a short breakdown per line (qty × price incl. chosen option surcharges) ' +
      'and the subtotal; mention the delivery fee/minimum order if relevant. Never invent dishes or prices; say if something is sold out.\n' +
      'You cannot take or create orders yourself: end with a short hint to tap the "Order now" button. ' +
      'Never ask for or reveal personal data. Keep it short, friendly, plain text (no markdown tables).\n' +
      'Greetings, small talk, recommendations ("what is good/spicy/for kids?") and general food questions ARE in scope: answer them warmly using the menu. ' +
      'Set "confident" to false ONLY for complaints, problems with an existing order/payment/delivery, or requests staff must handle — ' +
      'still write a short polite "answer" in that case.\n' +
      'Reply ONLY with JSON {"answer": string, "confident": boolean, "lang": "id"|"en"|"kh"|"zh"|"other"} ' +
      '(lang = language of the CUSTOMER message).\n\nCONTEXT:\n' +
      context;
    const r = await generateJson<{ answer?: string; confident?: boolean; lang?: string }>(
      app,
      system,
      question.slice(0, 1000),
    );
    const aiLang = (LANGS as readonly string[]).includes(r.lang ?? '') ? (r.lang as Lang) : detected;
    const answer = r.answer?.trim();
    if (!answer) return { text: FALLBACK_REPLY[aiLang], forward: true, reason: 'unsure', lang: aiLang };
    // Tidak yakin (komplain / urusan order) → tetap kirim jawaban AI, sekaligus teruskan ke admin.
    if (r.confident === false)
      return { text: answer.slice(0, 3500), forward: true, reason: 'unsure', lang: aiLang };
    return { text: answer.slice(0, 3500), forward: false, reason: 'ok', lang: aiLang };
  } catch (err) {
    const quota = isQuotaError(err);
    const msg = (err as Error).message ?? String(err);
    app.log.warn({ err: msg, quota }, 'Gemini answer gagal');
    return fallback(quota ? 'quota' : 'error', msg.slice(0, 500));
  }
}
