/**
 * Jaring pengaman terjemahan menu: semua nama kategori, menu (+ deskripsi), grup pilihan dan
 * pilihan yang bahasa EN/ខ្មែរ/中文-nya masih kosong diterjemahkan otomatis di server.
 * Dipicu (debounce) setelah setiap perubahan menu admin dan sekali saat server menyala, jadi data
 * dari jalur mana pun (form admin, impor, data lama) ikut terisi. Bahasa yang sudah terisi
 * (termasuk koreksi manual) tidak pernah ditimpa.
 */
import { LANGS, type Lang, type LocalizedText } from '@pos/shared';
import { eq, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { categories, menuItems, optionGroups, options } from '../../db/schema';
import { isMockText, translateEntries, type TranslateEntry } from '../ai/service';

const TARGETS = LANGS.filter((l) => l !== 'id') as Lang[];
const BATCH = 40;

type Target = { table: 'cat' | 'item' | 'desc' | 'group' | 'opt'; id: number; text: LocalizedText };

const missing = (t: LocalizedText): Lang[] =>
  t.id?.trim() ? TARGETS.filter((l) => !t[l]?.trim() || isMockText(t[l])) : [];

async function collect(app: FastifyInstance): Promise<Target[]> {
  const [cats, items, groups, opts] = await Promise.all([
    app.db.select({ id: categories.id, name: categories.name }).from(categories),
    app.db
      .select({ id: menuItems.id, name: menuItems.name, description: menuItems.description })
      .from(menuItems),
    app.db.select({ id: optionGroups.id, name: optionGroups.name }).from(optionGroups),
    app.db.select({ id: options.id, name: options.name }).from(options),
  ]);
  const out: Target[] = [];
  for (const c of cats) out.push({ table: 'cat', id: c.id, text: c.name });
  for (const i of items) {
    out.push({ table: 'item', id: i.id, text: i.name });
    out.push({ table: 'desc', id: i.id, text: i.description as LocalizedText });
  }
  for (const g of groups) out.push({ table: 'group', id: g.id, text: g.name });
  for (const o of opts) out.push({ table: 'opt', id: o.id, text: o.name });
  return out.filter((t) => missing(t.text).length);
}

/** Simpan hanya bahasa yang masih kosong: `baru || lama` → nilai yang sudah ada tetap menang. */
async function save(app: FastifyInstance, t: Target, add: Partial<LocalizedText>) {
  const patch = sql`${JSON.stringify(add)}::jsonb`;
  if (t.table === 'cat')
    await app.db
      .update(categories)
      .set({ name: sql`${patch} || ${categories.name}` })
      .where(eq(categories.id, t.id));
  else if (t.table === 'item')
    await app.db
      .update(menuItems)
      .set({ name: sql`${patch} || ${menuItems.name}` })
      .where(eq(menuItems.id, t.id));
  else if (t.table === 'desc')
    await app.db
      .update(menuItems)
      .set({ description: sql`${patch} || ${menuItems.description}` })
      .where(eq(menuItems.id, t.id));
  else if (t.table === 'group')
    await app.db
      .update(optionGroups)
      .set({ name: sql`${patch} || ${optionGroups.name}` })
      .where(eq(optionGroups.id, t.id));
  else
    await app.db
      .update(options)
      .set({ name: sql`${patch} || ${options.name}` })
      .where(eq(options.id, t.id));
}

/** Terjemahkan semua yang kosong. Mengembalikan jumlah teks yang diperbarui. */
export async function fillMenuTranslations(
  app: FastifyInstance,
  deps: { fetchFn?: typeof fetch } = {},
): Promise<number> {
  const targets = await collect(app);
  let updated = 0;
  for (let i = 0; i < targets.length; i += BATCH) {
    const chunk = targets.slice(i, i + BATCH);
    const entries: TranslateEntry[] = chunk.map((t, k) => ({
      key: String(k),
      text: { ...t.text, id: t.text.id.trim() },
      overwrite: false,
    }));
    const res = await translateEntries(app, entries, TARGETS, deps);
    // Jangan pernah menyimpan teks mock / tanpa penerjemah.
    if (res.provider === 'none' || res.provider === 'mock') break;
    for (const e of res.entries) {
      const t = chunk[Number(e.key)]!;
      const add: Partial<LocalizedText> = {};
      for (const l of missing(t.text)) {
        const v = e.text[l];
        if (v?.trim() && !isMockText(v)) add[l] = v;
      }
      if (Object.keys(add).length) {
        await save(app, t, add);
        updated++;
      }
    }
  }
  return updated;
}

let timer: NodeJS.Timeout | null = null;
let running = false;
let again = false;

/** Jadwalkan pengisian terjemahan (debounce); `onDone` dipanggil bila ada yang diperbarui. */
export function scheduleMenuTranslations(app: FastifyInstance, onDone: () => void, delayMs = 1500) {
  if (app.config.isTest) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void run(app, onDone);
  }, delayMs);
  timer.unref?.();
}

async function run(app: FastifyInstance, onDone: () => void) {
  if (running) {
    again = true;
    return;
  }
  running = true;
  try {
    const n = await fillMenuTranslations(app);
    if (n) {
      app.log.info({ updated: n }, 'Terjemahan menu otomatis diisi');
      onDone();
    }
  } catch (err) {
    app.log.warn({ err: (err as Error).message }, 'Terjemahan menu otomatis gagal');
  } finally {
    running = false;
    if (again) {
      again = false;
      scheduleMenuTranslations(app, onDone);
    }
  }
}
