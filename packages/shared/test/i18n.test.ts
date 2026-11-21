import { describe, expect, it } from 'vitest';
import { CUSTOMER_FACING_SECTIONS, dictionaries } from '../src/i18n';
import { ERROR_CODES, ORDER_CHANNELS, ORDER_STATUSES, ORDER_TYPES } from '../src/enums';
import { t } from '../src/localized';
import { ERROR_REASONS, errorReasonOf } from '../src/errorReasons';

function keys(obj: unknown, prefix = ''): string[] {
  if (typeof obj === 'string') return [prefix];
  return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) =>
    keys(v, prefix ? `${prefix}.${k}` : k),
  );
}

describe('i18n dictionaries', () => {
  const idKeys = keys(dictionaries.id).sort();
  it('en is complete', () => {
    expect(keys(dictionaries.en).sort()).toEqual(idKeys);
  });
  for (const lang of ['kh', 'zh'] as const) {
    it(`${lang} complete for customer-facing sections`, () => {
      for (const s of CUSTOMER_FACING_SECTIONS) {
        expect(keys(dictionaries[lang][s], s).sort()).toEqual(keys(dictionaries.id[s], s).sort());
      }
    });
    // Sejak admin & semua layar staf 4 bahasa: kh/zh lengkap untuk SEMUA bagian (tanpa fallback en/id).
    it(`${lang} is complete (every section)`, () => {
      expect(keys(dictionaries[lang]).sort()).toEqual(idKeys);
    });
  }
  it('plural forms and {{placeholders}} match id in every language', () => {
    const get = (d: unknown, k: string) =>
      k.split('.').reduce<unknown>((o, p) => (o as Record<string, unknown>)[p], d) as string;
    const vars = (v: string) => (v.match(/{{\w+}}/g) ?? []).sort().join(',');
    for (const lang of ['en', 'kh', 'zh'] as const) {
      for (const k of idKeys)
        expect([k, vars(get(dictionaries[lang], k))]).toEqual([k, vars(get(dictionaries.id, k))]);
    }
  });
  it('every server error reason has a translation key', () => {
    for (const r of Object.keys(ERROR_REASONS)) expect(idKeys).toContain(`errorReason.${r}`);
  });
  it('no empty strings', () => {
    for (const d of Object.values(dictionaries)) {
      for (const k of keys(d)) {
        const v = k.split('.').reduce<unknown>((o, p) => (o as Record<string, unknown>)[p], d);
        expect(typeof v === 'string' && v.trim().length > 0, k).toBe(true);
      }
    }
  });
  it('covers every enum value', () => {
    for (const s of ORDER_STATUSES) expect(dictionaries.id.status[s]).toBeTruthy();
    for (const c of ORDER_CHANNELS) expect(dictionaries.id.channel[c]).toBeTruthy();
    for (const tp of ORDER_TYPES) expect(dictionaries.id.orderType[tp]).toBeTruthy();
    for (const e of ERROR_CODES) expect(dictionaries.id.errors[e]).toBeTruthy();
  });
});

describe('errorReasonOf', () => {
  it('maps exact server messages and extracts params', () => {
    expect(errorReasonOf('Kategori masih berisi menu')).toEqual({ reason: 'categoryHasItems', params: {} });
    expect(errorReasonOf('Butuh izin: menu.manage / settings.manage')).toEqual({
      reason: 'needPermission',
      params: { perms: 'menu.manage / settings.manage' },
    });
    expect(errorReasonOf('Sesuatu yang lain')).toBeNull();
    expect(errorReasonOf(undefined)).toBeNull();
  });
});

describe('t (localized text)', () => {
  const name = { id: 'Ayam Goreng', en: 'Fried Chicken', kh: '', zh: '炸鸡' };
  it('picks language', () => {
    expect(t(name, 'en')).toBe('Fried Chicken');
    expect(t(name, 'zh')).toBe('炸鸡');
  });
  it('falls back to id when empty/missing', () => {
    expect(t(name, 'kh')).toBe('Ayam Goreng');
    expect(t({ id: 'Kerupuk' }, 'en')).toBe('Kerupuk');
    expect(t(null, 'en')).toBe('');
  });
});
