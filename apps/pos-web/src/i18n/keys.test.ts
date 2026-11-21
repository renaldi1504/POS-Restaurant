/**
 * Kamus i18n pos-web: semua kunci t('…') yang dipakai kode ada di 4 bahasa, dan kamus kh/zh LENGKAP
 * (shared + extra) sehingga tidak ada layar staf yang jatuh ke en/id.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PERMISSION_KEYS, ROLE_NAMES, permissionI18nKey } from '@pos/shared';
import { dictionaries } from '@pos/shared/i18n';
import i18n from '../lib/i18n';
import { extraEn, extraId, extraKh, extraZh } from './extra';

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return files(p);
    return /\.(tsx?|ts)$/.test(f) && !/\.test\./.test(f) ? [p] : [];
  });
}

function flat(obj: unknown, prefix = ''): [string, string][] {
  if (typeof obj === 'string') return [[prefix, obj]];
  return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) =>
    flat(v, prefix ? `${prefix}.${k}` : k),
  );
}

const vars = (s: string) => (s.match(/{{\w+}}/g) ?? []).sort().join(',');
const exists = (k: string, lng: string) =>
  i18n.exists(k, { lng, fallbackLng: false } as never) ||
  i18n.exists(`${k}_other`, { lng, fallbackLng: false } as never);

describe('kamus i18n', () => {
  const root = join(__dirname, '..');
  const keys = new Set<string>();
  for (const f of files(root)) {
    const src = readFileSync(f, 'utf8');
    for (const m of src.matchAll(/\bt\(\s*['`]([a-zA-Z]+\.[a-zA-Z0-9_.]+)['`]/g)) keys.add(m[1]!);
    for (const m of src.matchAll(/(?:key|short): '([a-z]+\.[a-zA-Z.]+)'/g)) keys.add(m[1]!);
    for (const m of src.matchAll(/new Error\('(localErr\.[a-zA-Z]+)'\)/g)) keys.add(m[1]!);
  }
  for (const k of PERMISSION_KEYS) keys.add(permissionI18nKey(k));
  for (const k of Object.keys(ROLE_NAMES)) keys.add(`role.${k}`);

  it('menemukan kunci', () => expect(keys.size).toBeGreaterThan(300));

  // Semua layar staf (login, kasir, meja, admin, dapur, driver, …) lengkap di 4 bahasa — tanpa fallback.
  for (const lng of ['id', 'en', 'kh', 'zh'] as const) {
    it(`semua kunci yang dipakai kode ada di ${lng}`, () => {
      expect([...keys].filter((k) => !exists(k, lng))).toEqual([]);
    });
  }

  const extras = { en: extraEn, kh: extraKh, zh: extraZh } as const;
  const idExtra = flat(extraId);
  for (const lng of ['en', 'kh', 'zh'] as const) {
    it(`kamus tambahan pos-web lengkap di ${lng} (kunci & {{placeholder}} sama dengan id)`, () => {
      const other = new Map(flat(extras[lng]));
      expect(idExtra.filter(([k]) => !other.has(k)).map(([k]) => k)).toEqual([]);
      expect(
        idExtra.filter(([k, v]) => other.has(k) && vars(other.get(k)!) !== vars(v)).map(([k]) => k),
      ).toEqual([]);
      expect([...other.values()].filter((v) => !v.trim())).toEqual([]);
    });
    it(`kamus shared lengkap di ${lng} (kunci & {{placeholder}} sama dengan id)`, () => {
      const idShared = flat(dictionaries.id);
      const other = new Map(flat(dictionaries[lng]));
      expect(idShared.filter(([k]) => !other.has(k)).map(([k]) => k)).toEqual([]);
      expect(idShared.filter(([k, v]) => vars(other.get(k) ?? '') !== vars(v)).map(([k]) => k)).toEqual([]);
    });
  }

  it('kh/zh benar-benar diterjemahkan (bukan salinan Inggris/Indonesia)', () => {
    // Label pendek yang sengaja sama (merek, kode, angka) dikecualikan.
    const SAME_OK =
      /^(Bot Telegram & AI|ABA|PIN|QR|Grab|foodpanda|Telegram|Gemini AI|Bluetooth.*|GRAB|FOODPANDA|TELEGRAM · MINI APP|Bot Telegram|Owner|Admin|Zoom|Status|Driver|Cash.*|Split.*|Printer.*|Promo|Dashboard|Settings|Gemini.*|.*{{.*}}.*)$/;
    for (const lng of ['kh', 'zh'] as const) {
      const all = [...flat(dictionaries[lng]), ...flat(extras[lng])];
      const ids = new Map([...flat(dictionaries.id), ...idExtra]);
      const ens = new Map([...flat(dictionaries.en), ...flat(extraEn)]);
      const copies = all.filter(
        ([k, v]) =>
          !k.startsWith('lang.') &&
          (v === ids.get(k) || v === ens.get(k)) &&
          !SAME_OK.test(v) &&
          !/[0-9]/.test(v),
      );
      expect(copies.map(([k, v]) => `${k}=${v}`)).toEqual([]);
    }
  });
});
