import type { FastifyInstance } from 'fastify';
import { defineRoute } from '../../lib/route';
import { translateEntries } from './service';

export default async function aiRoutes(app: FastifyInstance) {
  defineRoute(app, 'adminTranslate', async ({ body }) =>
    translateEntries(
      app,
      body.entries.map((e) => ({ key: e.key, text: e.text, overwrite: e.overwrite })),
      body.targets,
    ),
  );
}
