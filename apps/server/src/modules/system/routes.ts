import { sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { UPLOADS_PATH } from '@pos/shared';
import { notFound } from '../../lib/errors';
import { defineRoute } from '../../lib/route';
import { requireStaff } from '../../lib/session';

const VERSION = process.env.npm_package_version ?? '0.1.0';

export default async function systemRoutes(app: FastifyInstance) {
  defineRoute(app, 'health', async () => {
    let db = false;
    try {
      await app.db.execute(sql`select 1`);
      db = true;
    } catch {
      db = false;
    }
    return { ok: db, version: VERSION, time: new Date().toISOString(), db };
  });

  // File private (bukti bayar, foto nota) — hanya staf login.
  app.get(`${UPLOADS_PATH}/private/*`, async (req, reply) => {
    requireStaff(req);
    const key = (req.params as { '*': string })['*'];
    const file = await app.storage.readPrivate(key);
    if (!file) throw notFound('File tidak ditemukan');
    if (file.contentType) reply.type(file.contentType);
    reply.header('Cache-Control', 'private, max-age=3600');
    return reply.send(file.stream);
  });
}
