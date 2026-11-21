import type { FastifyInstance } from 'fastify';
import { describe, expect, it, vi } from 'vitest';

const calls: string[] = [];
vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = {
      generateContent: async ({ model }: { model: string }) => {
        calls.push(model);
        if (model === 'gemini-2.5-flash')
          throw Object.assign(
            new Error(
              '{"error":{"code":404,"message":"This model models/gemini-2.5-flash is no longer available to new users.","status":"NOT_FOUND"}}',
            ),
            { status: 404 },
          );
        return { text: '```json\n{"g":{"en":"Rice","kh":"បាយ","zh":"米饭"}}\n```' };
      },
    };
  },
}));

const { translateEntries, currentGeminiModel, isModelUnavailable } =
  await import('../src/modules/ai/service');

const app = {
  config: {
    GEMINI_API_KEY: 'k',
    GEMINI_MODEL: 'gemini-2.5-flash',
    isProd: true,
    isTest: false,
    TRANSLATE_FREE_ENABLED: false,
  },
  log: { warn: () => undefined },
} as unknown as FastifyInstance;

describe('model Gemini dihentikan → otomatis pakai model cadangan', () => {
  it('404 "no longer available" → coba gemini-3.8-flash, lalu diingat', async () => {
    const r = await translateEntries(app, [{ key: 'g', text: { id: 'Nasi' }, overwrite: false }]);
    expect(r.provider).toBe('gemini');
    expect(r.entries[0]!.text).toEqual({ id: 'Nasi', en: 'Rice', kh: 'បាយ', zh: '米饭' });
    expect(calls.slice(0, 2)).toEqual(['gemini-2.5-flash', 'gemini-3.8-flash']);
    expect(currentGeminiModel(app)).toBe('gemini-3.8-flash');
    calls.length = 0;
    await translateEntries(app, [{ key: 'g', text: { id: 'Nasi' }, overwrite: false }]);
    expect(calls).toEqual(['gemini-3.8-flash']);
  });

  it('deteksi error model tidak tersedia', () => {
    expect(isModelUnavailable({ status: 404 })).toBe(true);
    expect(isModelUnavailable(new Error('models/x is no longer available'))).toBe(true);
    expect(isModelUnavailable(new Error('API key not valid'))).toBe(false);
  });
});
