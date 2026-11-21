import type { FastifyInstance } from 'fastify';
import { defineRoute } from '../../lib/route';
import { getSettings } from '../../lib/settings';
import { answerQuestion, translateEntries } from './service';

export default async function aiRoutes(app: FastifyInstance) {
  defineRoute(app, 'adminAiTest', async ({ body }) => {
    const settings = await getSettings(app.db);
    const r = await answerQuestion(app, body.question, 'id');
    return {
      keySet: !!app.config.GEMINI_API_KEY,
      aiEnabled: settings.ai.enabled,
      model: app.config.GEMINI_MODEL,
      reason: r.reason,
      lang: r.lang,
      answer: r.text,
      forwarded: r.forward,
      error: r.error ?? null,
    };
  });

  defineRoute(app, 'adminTranslate', async ({ body }) =>
    translateEntries(
      app,
      body.entries.map((e) => ({ key: e.key, text: e.text, overwrite: e.overwrite })),
      body.targets,
    ),
  );
}
