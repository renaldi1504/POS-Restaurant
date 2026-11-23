import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { categories } from '../src/db/schema';
import { fillMenuTranslations } from '../src/modules/menu/autoTranslate';
import { call, createTestApp, loginAs } from './helpers';

let app: FastifyInstance;
let owner: string;

beforeAll(async () => {
  app = await createTestApp();
  await app.ready();
  owner = await loginAs(app, 'Owner');
});
afterAll(async () => {
  await app.close();
});

const fetchFn = (async (u: URL) => {
  const lp = u.searchParams.get('langpair');
  const q = u.searchParams.get('q');
  const text = `${lp === 'id|en' ? 'EN' : lp === 'id|km' ? 'KM' : 'ZH'}:${q}`;
  return new Response(JSON.stringify({ responseStatus: 200, responseData: { translatedText: text } }));
}) as unknown as typeof fetch;

describe('terjemahan menu otomatis di server', () => {
  it('mengisi bahasa kosong, tidak menimpa yang sudah diisi manual', async () => {
    const res = await call(app, 'adminCategoryCreate', {
      cookie: owner,
      body: { name: { id: 'Minuman Dingin', en: 'Cold drinks (manual)' } },
    });
    expect(res.statusCode, res.body).toBe(200);
    const id = res.json().category.id as number;

    const cfg = app.config as { TRANSLATE_FREE_ENABLED: boolean };
    const prev = cfg.TRANSLATE_FREE_ENABLED;
    cfg.TRANSLATE_FREE_ENABLED = true;
    try {
      expect(await fillMenuTranslations(app, { fetchFn })).toBeGreaterThan(0);
    } finally {
      cfg.TRANSLATE_FREE_ENABLED = prev;
    }
    const [row] = await app.db.select().from(categories).where(eq(categories.id, id));
    expect(row!.name).toEqual({
      id: 'Minuman Dingin',
      en: 'Cold drinks (manual)',
      kh: 'KM:Minuman Dingin',
      zh: 'ZH:Minuman Dingin',
    });
  });

  it('tanpa penerjemah (provider none/mock) tidak menyimpan apa pun', async () => {
    const res = await call(app, 'adminCategoryCreate', {
      cookie: owner,
      body: { name: { id: 'Camilan Sore' } },
    });
    const id = res.json().category.id as number;
    await fillMenuTranslations(app);
    const [row] = await app.db.select().from(categories).where(eq(categories.id, id));
    expect(row!.name).toEqual({ id: 'Camilan Sore' });
  });
});
