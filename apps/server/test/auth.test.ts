import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuthUsersResponse, ErrorResponse, MeResponse, PinLoginResponse } from '@pos/shared';
import { users } from '../src/db/schema';
import { requirePermission } from '../src/lib/session';
import { call, cookieHeader, createTestApp, loginAs, userIdByName } from './helpers';

let app: FastifyInstance;

beforeAll(async () => {
  app = await createTestApp();
  // route uji untuk guard permission
  app.get('/api/__test/settings-only', { preHandler: requirePermission('settings.manage') }, async () => ({
    ok: true,
  }));
  await app.ready();
});
afterAll(async () => {
  await app.close();
});

describe('GET /api/health', () => {
  it('reports db ok', async () => {
    const res = await call(app, 'health');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true, db: true });
  });
});

describe('GET /api/auth/users', () => {
  it('lists active staff cards without the bot user', async () => {
    const res = await call(app, 'authUsers');
    expect(res.statusCode).toBe(200);
    const body = AuthUsersResponse.parse(res.json());
    expect(body.users.map((u) => u.name)).toEqual(['Owner', 'Kasir Pagi', 'Kasir Malam', 'Dapur', 'Driver']);
    expect(body.users.find((u) => u.name === 'Kasir Pagi')).toMatchObject({
      roleName: 'Kasir',
      initials: 'KP',
      locked: false,
    });
  });
});

describe('POST /api/auth/pin', () => {
  it('logs in with correct PIN and sets an httpOnly signed cookie', async () => {
    const userId = await userIdByName(app, 'Kasir Pagi');
    const res = await call(app, 'authPin', { body: { userId, pin: '1111' } });
    expect(res.statusCode).toBe(200);
    const body = PinLoginResponse.parse(res.json());
    expect(body.user).toMatchObject({ name: 'Kasir Pagi', role: { name: 'Kasir' } });
    expect(body.user.permissions).toContain('order.create');
    expect(body.user.permissions).not.toContain('menu.manage');
    const c = res.cookies.find((x) => x.name === 'pos_sid');
    expect(c?.httpOnly).toBe(true);
    expect(c?.sameSite).toBe('Lax');
    expect(c?.value).toContain('.'); // signed
  });

  it('rejects malformed PIN with VALIDATION_ERROR', async () => {
    const res = await call(app, 'authPin', { body: { userId: 1, pin: '12' } });
    expect(res.statusCode).toBe(400);
    expect(ErrorResponse.parse(res.json()).error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects the system bot user', async () => {
    const botId = await userIdByName(app, 'Bot Telegram');
    const res = await call(app, 'authPin', { body: { userId: botId, pin: '0000' } });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('PIN_INVALID');
  });

  it('counts wrong attempts and locks after 5 for 5 minutes', async () => {
    const userId = await userIdByName(app, 'Kasir Malam');
    for (let i = 1; i <= 4; i++) {
      const res = await call(app, 'authPin', { body: { userId, pin: '9999' } });
      expect(res.statusCode).toBe(401);
      expect(res.json().error).toMatchObject({ code: 'PIN_INVALID', details: { remainingAttempts: 5 - i } });
    }
    const fifth = await call(app, 'authPin', { body: { userId, pin: '9999' } });
    expect(fifth.statusCode).toBe(423);
    expect(fifth.json().error.code).toBe('PIN_LOCKED');
    const lockedUntil = new Date(fifth.json().error.details.lockedUntil).getTime();
    expect(lockedUntil - Date.now()).toBeGreaterThan(4 * 60_000);

    // PIN benar pun ditolak selama terkunci
    const correct = await call(app, 'authPin', { body: { userId, pin: '2222' } });
    expect(correct.statusCode).toBe(423);

    const list = AuthUsersResponse.parse((await call(app, 'authUsers')).json());
    expect(list.users.find((u) => u.id === userId)?.locked).toBe(true);

    // Setelah kunci lewat → bisa login lagi
    await app.db
      .update(users)
      .set({ lockedUntil: new Date(Date.now() - 1000) })
      .where(eq(users.id, userId));
    const after = await call(app, 'authPin', { body: { userId, pin: '2222' } });
    expect(after.statusCode).toBe(200);
  });
});

describe('session: /api/auth/me & logout', () => {
  it('401 without cookie', async () => {
    const res = await call(app, 'authMe');
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('UNAUTHORIZED');
  });

  it('401 with a tampered cookie', async () => {
    const res = await call(app, 'authMe', { cookie: 'pos_sid=abc.def' });
    expect(res.statusCode).toBe(401);
  });

  it('returns current user and is revoked by logout', async () => {
    const cookie = await loginAs(app, 'Dapur');
    const me = await call(app, 'authMe', { cookie });
    expect(me.statusCode).toBe(200);
    expect(MeResponse.parse(me.json()).user).toMatchObject({ name: 'Dapur', role: { name: 'Dapur' } });

    const out = await call(app, 'authLogout', { cookie });
    expect(out.statusCode).toBe(200);
    expect(cookieHeader(out)).toContain('pos_sid=');

    const again = await call(app, 'authMe', { cookie });
    expect(again.statusCode).toBe(401);
  });

  it('deactivated user loses session', async () => {
    const cookie = await loginAs(app, 'Driver');
    const id = await userIdByName(app, 'Driver');
    await app.db.update(users).set({ active: false }).where(eq(users.id, id));
    expect((await call(app, 'authMe', { cookie })).statusCode).toBe(401);
    await app.db.update(users).set({ active: true }).where(eq(users.id, id));
  });
});

describe('permission guard', () => {
  it('403 for cashier, 200 for owner', async () => {
    const kasir = await loginAs(app, 'Kasir Pagi');
    const r1 = await app.inject({
      method: 'GET',
      url: '/api/__test/settings-only',
      headers: { cookie: kasir },
    });
    expect(r1.statusCode).toBe(403);
    expect(r1.json().error.code).toBe('FORBIDDEN');
    const owner = await loginAs(app, 'Owner');
    const r2 = await app.inject({
      method: 'GET',
      url: '/api/__test/settings-only',
      headers: { cookie: owner },
    });
    expect(r2.statusCode).toBe(200);
  });

  it('unknown route → NOT_FOUND error shape', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/nope' });
    expect(res.statusCode).toBe(404);
    expect(ErrorResponse.parse(res.json()).error.code).toBe('NOT_FOUND');
  });
});
