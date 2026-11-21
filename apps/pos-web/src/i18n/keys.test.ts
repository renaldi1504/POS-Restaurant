/** Semua kunci t('…') yang dipakai di kode harus ada di kamus id & en (shared + extra). */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import i18n from '../lib/i18n';

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return files(p);
    return /\.(tsx?|ts)$/.test(f) && !/\.test\./.test(f) ? [p] : [];
  });
}

describe('kamus i18n', () => {
  const root = join(__dirname, '..');
  const keys = new Set<string>();
  for (const f of files(root)) {
    const src = readFileSync(f, 'utf8');
    for (const m of src.matchAll(/\bt\(\s*['`]([a-zA-Z]+\.[a-zA-Z0-9_.]+)['`]/g)) keys.add(m[1]!);
    for (const m of src.matchAll(/key: '([a-z]+\.[a-zA-Z]+)'/g)) keys.add(m[1]!);
  }
  it('menemukan kunci', () => expect(keys.size).toBeGreaterThan(200));
  // SPEC §7: layar dapur & driver lengkap dalam kh & zh (tanpa jatuh ke en/id).
  const screenKeys = new Set<string>();
  for (const f of ['pages/kitchen/KitchenPage.tsx', 'pages/driver/DriverPage.tsx']) {
    const src = readFileSync(join(root, f), 'utf8');
    for (const m of src.matchAll(/\bt\(\s*['`]([a-zA-Z]+\.[a-zA-Z0-9_.]+)['`]/g)) screenKeys.add(m[1]!);
  }
  for (const lng of ['kh', 'zh'] as const) {
    it(`layar dapur & driver lengkap di ${lng}`, () => {
      const missing = [...screenKeys].filter(
        (k) =>
          !i18n.exists(k, { lng, fallbackLng: false } as never) &&
          !i18n.exists(`${k}_other`, { lng, fallbackLng: false } as never),
      );
      expect(missing).toEqual([]);
    });
  }
  for (const lng of ['id', 'en'] as const) {
    it(`semua kunci ada di ${lng}`, () => {
      const missing = [...keys].filter(
        (k) =>
          !i18n.exists(k, { lng, fallbackLng: false } as never) &&
          !i18n.exists(`${k}_other`, { lng, fallbackLng: false } as never),
      );
      expect(missing).toEqual([]);
    });
  }
});
