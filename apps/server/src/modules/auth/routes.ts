import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { users } from '../../db/schema';
import { defineRoute } from '../../lib/route';
import {
  createStaffSession,
  destroyStaffSession,
  loadStaffBySessionId,
  toStaffUser,
} from '../../lib/session';
import { AppError } from '../../lib/errors';
import { listLoginUsers, verifyLogin } from './service';

export default async function authRoutes(app: FastifyInstance) {
  defineRoute(app, 'authUsers', async () => ({ users: await listLoginUsers(app.db) }));

  defineRoute(app, 'authPin', async ({ body, req, reply }) => {
    const userId = await verifyLogin(app.db, body.userId, body.pin);
    const session = await createStaffSession(app, reply, userId, req.headers['user-agent']);
    const staff = await loadStaffBySessionId(app.db, session.id);
    if (!staff) throw new AppError(500, 'INTERNAL_ERROR', 'Sesi gagal dibuat');
    return { user: toStaffUser(staff), expiresAt: session.expiresAt.toISOString() };
  });

  defineRoute(app, 'authLogout', async ({ req, reply }) => {
    await destroyStaffSession(app, req, reply);
    return { ok: true as const };
  });

  defineRoute(app, 'authMe', async ({ staff }) => ({ user: toStaffUser(staff) }));

  // Bahasa tampilan dipilih sendiri oleh staf (lembar Lainnya / layar dapur / driver).
  defineRoute(app, 'authMeLang', async ({ staff, body }) => {
    await app.db.update(users).set({ lang: body.lang }).where(eq(users.id, staff.id));
    return { user: toStaffUser({ ...staff, lang: body.lang }) };
  });
}
