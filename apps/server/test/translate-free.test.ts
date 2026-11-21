import type { FastifyInstance } from 'fastify';
import { describe, expect, it } from 'vitest';
import { freeTranslate, isMockText, translateEntries } from '../src/modules/ai/service';

function fakeApp(over: Record<string, unknown> = {}) {
  return {
    config: { isProd: true, isTest: false, TRANSLATE_FREE_ENABLED: true, GEMINI_API_KEY: undefined, ...over },
    log: { warn: () => undefined },
  } as unknown as FastifyInstance;
}

const reply = (text: string, status = 200) =>
  (async () =>
    new Response(JSON.stringify({ responseStatus: status, responseData: { translatedText: text } }), {
      status: 200,
    })) as unknown as typeof fetch;

describe('terjemahan otomatis tanpa Gemini', () => {
  it('MyMemory gratis mengisi bahasa yang kosong (provider free)', async () => {
    const urls: string[] = [];
    const fetchFn = (async (u: URL) => {
      urls.push(String(u));
      const lp = u.searchParams.get('langpair');
      const text = lp === 'id|en' ? 'Rice Options' : lp === 'id|km' ? 'ជម្រើសបាយ' : '米饭选择';
      return new Response(JSON.stringify({ responseStatus: 200, responseData: { translatedText: text } }));
    }) as unknown as typeof fetch;
    const res = await translateEntries(
      fakeApp(),
      [{ key: 'g', text: { id: 'Pilihan Nasi' }, overwrite: false }],
      undefined,
      { fetchFn },
    );
    expect(res.provider).toBe('free');
    expect(res.entries[0]!.text).toEqual({
      id: 'Pilihan Nasi',
      en: 'Rice Options',
      kh: 'ជម្រើសបាយ',
      zh: '米饭选择',
    });
    expect(urls.some((u) => u.includes('langpair=id%7Ckm'))).toBe(true);
  });

  it('production: bila semua gagal, kolom dibiarkan kosong — tidak pernah "[en] …"', async () => {
    const fetchFn = (async () => new Response('down', { status: 503 })) as unknown as typeof fetch;
    const res = await translateEntries(
      fakeApp(),
      [{ key: 'g', text: { id: 'Pilihan Nasi', en: '[en] Pilihan Nasi' }, overwrite: false }],
      undefined,
      { fetchFn },
    );
    expect(res.provider).toBe('none');
    expect(res.entries[0]!.text).toEqual({ id: 'Pilihan Nasi' });
  });

  it('sisa mock lama "[kh] …" diterjemahkan ulang', async () => {
    const res = await translateEntries(
      fakeApp(),
      [{ key: 'g', text: { id: 'Nasi', en: 'Rice', kh: '[kh] Nasi', zh: '米饭' }, overwrite: false }],
      undefined,
      { fetchFn: reply('បាយ') },
    );
    expect(res.entries[0]!.text.kh).toBe('បាយ');
    expect(res.entries[0]!.text.en).toBe('Rice');
    expect(isMockText('[en] Nasi')).toBe(true);
    expect(isMockText('Nasi')).toBe(false);
  });

  it('pesan peringatan kuota MyMemory tidak dipakai sebagai terjemahan', async () => {
    expect(
      await freeTranslate(
        fakeApp(),
        'Nasi',
        'en',
        reply('MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS'),
      ),
    ).toBeNull();
    expect(await freeTranslate(fakeApp(), 'Nasi', 'en', reply('x', 429))).toBeNull();
  });
});
