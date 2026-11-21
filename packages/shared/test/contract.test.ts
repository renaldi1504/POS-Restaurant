import { describe, expect, it } from 'vitest';
import { buildPath, endpoints } from '../src/api';
import { CreateOrderRequest, ListOrdersQuery } from '../src/schemas/orders';
import { DEFAULT_SETTINGS, Settings, SettingsPatch } from '../src/schemas/settings';

describe('API contract registry', () => {
  it('method+path pairs are unique', () => {
    const seen = new Set<string>();
    for (const [k, e] of Object.entries(endpoints)) {
      const id = `${e.method} ${e.path}`;
      expect(seen.has(id), `${k} duplikat ${id}`).toBe(false);
      seen.add(id);
    }
  });
  it('path params have a params schema', () => {
    for (const [k, e] of Object.entries(endpoints)) {
      if (e.path.includes(':')) expect('params' in e, k).toBe(true);
    }
  });
  it('staff endpoints under /api except webhook', () => {
    for (const e of Object.values(endpoints))
      expect(e.path.startsWith('/api/') || e.path === '/tg/webhook').toBe(true);
  });
  it('buildPath', () => {
    expect(buildPath('/api/orders/:id/accept', { id: 'abc' })).toBe('/api/orders/abc/accept');
    expect(() => buildPath('/api/orders/:id', {})).toThrow();
  });
});

describe('schemas', () => {
  it('default settings are valid', () => {
    expect(Settings.parse(DEFAULT_SETTINGS)).toEqual(DEFAULT_SETTINGS);
  });
  it('settings patch does not inject defaults', () => {
    expect(SettingsPatch.parse({ profile: { name: 'X' } })).toEqual({ profile: { name: 'X' } });
  });
  it('dine-in order needs a table', () => {
    const base = { type: 'dine_in', items: [{ itemId: 1, qty: 1 }] };
    expect(CreateOrderRequest.safeParse(base).success).toBe(false);
    const ok = CreateOrderRequest.parse({ ...base, tableId: 3 });
    expect(ok.channel).toBe('kasir');
    expect(ok.items[0]?.optionIds).toEqual([]);
  });
  it('orders query parses status list', () => {
    expect(ListOrdersQuery.parse({ status: 'accepted,cooking', active: 'true' })).toMatchObject({
      status: ['accepted', 'cooking'],
      active: true,
    });
  });
});
