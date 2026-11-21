import { describe, expect, it } from 'vitest';
import { webStrings } from './strings';

describe('teks web pelanggan', () => {
  it('lengkap & tidak kosong di 4 bahasa', () => {
    const keys = Object.keys(webStrings.id).sort();
    for (const lang of ['en', 'kh', 'zh'] as const) {
      expect(Object.keys(webStrings[lang]).sort()).toEqual(keys);
      for (const k of keys) expect(webStrings[lang][k as keyof typeof webStrings.id].trim()).not.toBe('');
    }
  });

  it('placeholder interpolasi sama di semua bahasa', () => {
    const vars = (s: string) => (s.match(/{{\w+}}/g) ?? []).sort().join(',');
    for (const k of Object.keys(webStrings.id) as (keyof typeof webStrings.id)[]) {
      for (const lang of ['en', 'kh', 'zh'] as const) {
        expect([k, vars(webStrings[lang][k])]).toEqual([k, vars(webStrings.id[k])]);
      }
    }
  });
});
