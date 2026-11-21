/**
 * Fastify app factory — dipakai index.ts (server nyata) dan test (`app.inject`).
 */
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance } from 'fastify';
import { mkdirSync } from 'node:fs';
import { MAX_UPLOAD_BYTES, UPLOADS_PATH } from '@pos/shared';
import { loadConfig, type AppConfig } from './config';
import { createDb } from './db/client';
import { registerErrorHandlers } from './lib/errors';
import { createJobs } from './lib/jobs';
import { registerSessionHook } from './lib/session';
import { createStorage } from './lib/storage';
import { registerModules } from './modules';
import { createRealtime } from './realtime';

export interface BuildAppOptions {
  config?: AppConfig;
  /** Override URL database (test memakai TEST_DATABASE_URL). */
  databaseUrl?: string;
  logger?: boolean;
}

export async function buildApp(opts: BuildAppOptions = {}): Promise<FastifyInstance> {
  const config = opts.config ?? loadConfig();
  const databaseUrl = opts.databaseUrl ?? (config.isTest ? config.TEST_DATABASE_URL : config.DATABASE_URL);

  const app = Fastify({
    logger:
      opts.logger === false
        ? false
        : {
            level: config.isTest ? 'warn' : config.LOG_LEVEL,
            transport: undefined,
            redact: ['req.headers.cookie', 'req.headers.authorization'],
          },
    trustProxy: true,
    bodyLimit: 1024 * 1024,
  });

  const { db, pool } = createDb(databaseUrl);
  app.decorate('config', config);
  app.decorate('db', db);
  app.decorate('pool', pool);
  app.decorate('storage', createStorage(config));
  app.decorate('jobs', await createJobs(config, app.log, databaseUrl));
  app.addHook('onClose', async () => {
    await app.jobs.stop();
    await pool.end();
  });

  // Body JSON kosong diperbolehkan (POST tanpa body).
  app.removeContentTypeParser('application/json');
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
    const text = typeof body === 'string' ? body : body.toString('utf8');
    if (!text.trim()) return done(null, undefined);
    try {
      done(null, JSON.parse(text));
    } catch {
      const err = new Error('JSON tidak valid') as Error & { statusCode: number };
      err.statusCode = 400;
      done(err, undefined);
    }
  });

  registerErrorHandlers(app);
  await app.register(cookie, { secret: config.SESSION_SECRET, hook: 'onRequest' });
  await app.register(cors, {
    origin: [config.POS_ORIGIN, config.ORDER_ORIGIN],
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  });
  if (config.RATE_LIMIT_ENABLED) {
    await app.register(rateLimit, {
      global: false,
      errorResponseBuilder: (_req, ctx) => ({
        statusCode: 429,
        error: { code: 'RATE_LIMITED', message: `Terlalu banyak permintaan, coba lagi ${ctx.after}` },
      }),
    });
  }
  await app.register(multipart, { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } });

  // File publik lokal (dev / tanpa R2). Di production Caddy juga bisa melayani folder ini.
  mkdirSync(app.storage.localPublicDir, { recursive: true });
  await app.register(fastifyStatic, {
    root: app.storage.localPublicDir,
    prefix: `${UPLOADS_PATH}/public/`,
    decorateReply: false,
    maxAge: '7d',
  });

  registerSessionHook(app);
  app.decorate('realtime', createRealtime(app));
  await registerModules(app);
  return app;
}
