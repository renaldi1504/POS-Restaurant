import { eq } from 'drizzle-orm';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import type { EndpointKey } from '@pos/shared';
import { buildApp } from '../src/app';
import { loadConfig } from '../src/config';
import { users } from '../src/db/schema';
import { SEED_USERS } from '../src/db/seed-data';

export async function createTestApp(): Promise<FastifyInstance> {
  return buildApp({ config: loadConfig({ NODE_ENV: 'test' }), logger: false });
}

export type SeedUserName = (typeof SEED_USERS)[number]['name'];

export async function userIdByName(app: FastifyInstance, name: string): Promise<number> {
  const [u] = await app.db.select({ id: users.id }).from(users).where(eq(users.name, name)).limit(1);
  if (!u) throw new Error(`User ${name} tidak ada`);
  return u.id;
}

/** Ambil header Cookie dari respons (untuk dikirim di request berikutnya). */
export function cookieHeader(res: LightMyRequestResponse): string {
  return res.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
}

/** Login staf seed (PIN dari SEED_USERS) dan kembalikan header Cookie. */
export async function loginAs(app: FastifyInstance, name: SeedUserName): Promise<string> {
  const seed = SEED_USERS.find((u) => u.name === name)!;
  const userId = await userIdByName(app, name);
  const res = await app.inject({ method: 'POST', url: '/api/auth/pin', payload: { userId, pin: seed.pin } });
  if (res.statusCode !== 200) throw new Error(`Login ${name} gagal: ${res.statusCode} ${res.body}`);
  return cookieHeader(res);
}

/** Helper inject berbasis key kontrak: `await call(app, 'authMe', { cookie })`. */
export async function call(
  app: FastifyInstance,
  key: EndpointKey,
  opts: {
    cookie?: string;
    params?: Record<string, string | number>;
    query?: Record<string, string>;
    body?: unknown;
  } = {},
) {
  const { endpoints, buildPath } = await import('@pos/shared');
  const def = endpoints[key];
  return app.inject({
    method: def.method,
    url: buildPath(def.path, opts.params),
    query: opts.query,
    payload: opts.body as never,
    headers: opts.cookie ? { cookie: opts.cookie } : {},
  });
}
