import { DEFAULT_SETTINGS, Settings, hoursEnvelope, type SettingsKey, type SettingsPatch } from '@pos/shared';
import { sql } from 'drizzle-orm';
import type { DbOrTx } from '../db/client';
import { settings as settingsTable } from '../db/schema';

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Gabung objek bertingkat (array & nilai lain diganti utuh). */
function deepMerge(base: unknown, patch: unknown): unknown {
  if (!isPlainObject(base) || !isPlainObject(patch)) return patch === undefined ? base : patch;
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    out[k] = deepMerge(base[k], v);
  }
  return out;
}

/** Ambil semua settings (digabung dengan default untuk key/field yang belum ada). */
export async function getSettings(db: DbOrTx): Promise<Settings> {
  const rows = await db.select().from(settingsTable);
  const merged: Record<string, unknown> = {};
  for (const key of Object.keys(DEFAULT_SETTINGS) as SettingsKey[]) {
    const row = rows.find((r) => r.key === key);
    merged[key] = deepMerge(DEFAULT_SETTINGS[key], row?.value ?? {});
  }
  return Settings.parse(merged);
}

/** Terapkan patch parsial per bagian; return settings baru. */
export async function patchSettings(db: DbOrTx, patch: SettingsPatch): Promise<Settings> {
  const current = await getSettings(db);
  const next: Record<string, unknown> = { ...current };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    next[key] = deepMerge(current[key as SettingsKey], value);
  }
  // Beberapa sesi buka → open/close = jam buka pertama & tutup terakhir (dasar hari operasional).
  const h = next.hours as Settings['hours'];
  if (h?.periods?.length) next.hours = { ...h, ...hoursEnvelope(h.periods) };
  const parsed = Settings.parse(next);
  for (const key of Object.keys(patch) as SettingsKey[]) {
    await db
      .insert(settingsTable)
      .values({ key, value: parsed[key] })
      .onConflictDoUpdate({ target: settingsTable.key, set: { value: parsed[key], updatedAt: sql`now()` } });
  }
  return parsed;
}
