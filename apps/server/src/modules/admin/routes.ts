import { and, count, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { expenseCategories, expenses, roles, sessions, users } from '../../db/schema';
import { writeAudit } from '../../lib/audit';
import { conflict, forbidden, notFound, validationError } from '../../lib/errors';
import { hashPin } from '../../lib/pin';
import { defineRoute } from '../../lib/route';
import { patchSettings } from '../../lib/settings';
import { readImageUpload } from '../../lib/upload';
import {
  adminSettings,
  assertOwnerRemains,
  getRoleDto,
  getUserDto,
  loadRoles,
  loadUsers,
  roleNameTaken,
} from './service';

export default async function adminRoutes(app: FastifyInstance) {
  // ---------- Pengguna ----------
  defineRoute(app, 'adminUsersList', async () => ({ users: await loadUsers(app.db) }));

  defineRoute(app, 'adminUserCreate', async ({ body, staff }) => {
    const [role] = await app.db.select().from(roles).where(eq(roles.id, body.roleId));
    if (!role) throw validationError('Role tidak ditemukan', [{ path: ['roleId'] }]);
    const [row] = await app.db
      .insert(users)
      .values({
        name: body.name,
        roleId: body.roleId,
        pinHash: await hashPin(body.pin),
        lang: body.lang,
        active: body.active,
      })
      .returning({ id: users.id });
    await writeAudit(app.db, {
      userId: staff.id,
      action: 'user.create',
      entity: 'user',
      entityId: row!.id,
      after: { name: body.name, roleId: body.roleId, lang: body.lang, active: body.active },
    });
    return { user: await getUserDto(app.db, row!.id) };
  });

  defineRoute(app, 'adminUserUpdate', async ({ params, body, staff }) => {
    const before = await getUserDto(app.db, params.id);
    if (before.system) throw forbidden('User sistem tidak bisa diubah');
    if (body.roleId !== undefined) {
      const [role] = await app.db.select().from(roles).where(eq(roles.id, body.roleId));
      if (!role) throw validationError('Role tidak ditemukan', [{ path: ['roleId'] }]);
    }
    if (body.active === false || body.roleId !== undefined)
      await assertOwnerRemains(app.db, { userId: params.id, active: body.active, roleId: body.roleId });
    const set: Partial<typeof users.$inferInsert> = {};
    if (body.name !== undefined) set.name = body.name;
    if (body.roleId !== undefined) set.roleId = body.roleId;
    if (body.lang !== undefined) set.lang = body.lang;
    if (body.active !== undefined) set.active = body.active;
    if (body.pin !== undefined) {
      set.pinHash = await hashPin(body.pin);
      set.failedAttempts = 0;
      set.lockedUntil = null;
    }
    if (body.unlock) {
      set.failedAttempts = 0;
      set.lockedUntil = null;
    }
    await app.db.transaction(async (tx) => {
      if (Object.keys(set).length) await tx.update(users).set(set).where(eq(users.id, params.id));
      // Nonaktif / ganti PIN → semua sesi user dicabut.
      if (body.active === false || body.pin !== undefined)
        await tx.delete(sessions).where(and(eq(sessions.kind, 'staff'), eq(sessions.userId, params.id)));
      await writeAudit(tx, {
        userId: staff.id,
        action: 'user.update',
        entity: 'user',
        entityId: params.id,
        before,
        after: { ...body, pin: body.pin ? '****' : undefined },
      });
    });
    return { user: await getUserDto(app.db, params.id) };
  });

  defineRoute(app, 'adminUserDelete', async ({ params, staff }) => {
    const before = await getUserDto(app.db, params.id);
    if (before.system) throw forbidden('User sistem tidak bisa dihapus');
    if (params.id === staff.id) throw conflict('CONFLICT', 'Tidak bisa menonaktifkan diri sendiri');
    await assertOwnerRemains(app.db, { userId: params.id, active: false });
    await app.db.transaction(async (tx) => {
      await tx.update(users).set({ active: false }).where(eq(users.id, params.id));
      await tx.delete(sessions).where(and(eq(sessions.kind, 'staff'), eq(sessions.userId, params.id)));
      await writeAudit(tx, {
        userId: staff.id,
        action: 'user.deactivate',
        entity: 'user',
        entityId: params.id,
        before,
      });
    });
    return { ok: true as const };
  });

  // ---------- Role ----------
  defineRoute(app, 'adminRolesList', async () => ({ roles: await loadRoles(app.db) }));

  defineRoute(app, 'adminRoleCreate', async ({ body, staff }) => {
    if (await roleNameTaken(app.db, body.name)) throw conflict('CONFLICT', 'Nama role sudah dipakai');
    const [row] = await app.db
      .insert(roles)
      .values({ name: body.name, permissions: [...new Set(body.permissions)], system: false })
      .returning({ id: roles.id });
    await writeAudit(app.db, {
      userId: staff.id,
      action: 'role.create',
      entity: 'role',
      entityId: row!.id,
      after: body,
    });
    return { role: await getRoleDto(app.db, row!.id) };
  });

  defineRoute(app, 'adminRoleUpdate', async ({ params, body, staff }) => {
    const before = await getRoleDto(app.db, params.id);
    if (before.system && body.name !== undefined && body.name !== before.name)
      throw forbidden('Nama role sistem tidak bisa diubah');
    if (body.name !== undefined && (await roleNameTaken(app.db, body.name, params.id)))
      throw conflict('CONFLICT', 'Nama role sudah dipakai');
    if (body.permissions)
      await assertOwnerRemains(app.db, { roleIdPerms: { roleId: params.id, permissions: body.permissions } });
    const set: Partial<typeof roles.$inferInsert> = {};
    if (body.name !== undefined) set.name = body.name;
    if (body.permissions !== undefined) set.permissions = [...new Set(body.permissions)];
    if (Object.keys(set).length) await app.db.update(roles).set(set).where(eq(roles.id, params.id));
    await writeAudit(app.db, {
      userId: staff.id,
      action: 'role.update',
      entity: 'role',
      entityId: params.id,
      before,
      after: body,
    });
    return { role: await getRoleDto(app.db, params.id) };
  });

  defineRoute(app, 'adminRoleDelete', async ({ params, staff }) => {
    const before = await getRoleDto(app.db, params.id);
    if (before.system) throw forbidden('Role sistem tidak bisa dihapus');
    if (before.userCount > 0) throw conflict('CONFLICT', 'Role masih dipakai pengguna');
    await app.db.delete(roles).where(eq(roles.id, params.id));
    await writeAudit(app.db, {
      userId: staff.id,
      action: 'role.delete',
      entity: 'role',
      entityId: params.id,
      before,
    });
    return { ok: true as const };
  });

  // ---------- Kategori pengeluaran ----------
  defineRoute(app, 'adminExpenseCategoryCreate', async ({ body, staff }) => {
    const [existing] = await app.db
      .select()
      .from(expenseCategories)
      .where(eq(expenseCategories.name, body.name));
    if (existing && existing.active) throw conflict('CONFLICT', 'Kategori sudah ada');
    const [row] = existing
      ? await app.db
          .update(expenseCategories)
          .set({ active: true })
          .where(eq(expenseCategories.id, existing.id))
          .returning()
      : await app.db.insert(expenseCategories).values({ name: body.name }).returning();
    await writeAudit(app.db, {
      userId: staff.id,
      action: 'expense_category.create',
      entity: 'expense_category',
      entityId: row!.id,
      after: body,
    });
    return { category: { id: row!.id, name: row!.name } };
  });

  defineRoute(app, 'adminExpenseCategoryUpdate', async ({ params, body, staff }) => {
    const [before] = await app.db.select().from(expenseCategories).where(eq(expenseCategories.id, params.id));
    if (!before) throw notFound('Kategori tidak ditemukan');
    if (body.name && body.name !== before.name) {
      const [dupe] = await app.db
        .select()
        .from(expenseCategories)
        .where(eq(expenseCategories.name, body.name));
      if (dupe) throw conflict('CONFLICT', 'Nama kategori sudah dipakai');
    }
    const [row] = body.name
      ? await app.db
          .update(expenseCategories)
          .set({ name: body.name })
          .where(eq(expenseCategories.id, params.id))
          .returning()
      : [before];
    await writeAudit(app.db, {
      userId: staff.id,
      action: 'expense_category.update',
      entity: 'expense_category',
      entityId: params.id,
      before,
      after: row,
    });
    return { category: { id: row!.id, name: row!.name } };
  });

  defineRoute(app, 'adminExpenseCategoryDelete', async ({ params, staff }) => {
    const [before] = await app.db.select().from(expenseCategories).where(eq(expenseCategories.id, params.id));
    if (!before) throw notFound('Kategori tidak ditemukan');
    const [{ n } = { n: 0 }] = await app.db
      .select({ n: count() })
      .from(expenses)
      .where(eq(expenses.categoryId, params.id));
    if (n > 0)
      await app.db
        .update(expenseCategories)
        .set({ active: false })
        .where(eq(expenseCategories.id, params.id));
    else await app.db.delete(expenseCategories).where(eq(expenseCategories.id, params.id));
    await writeAudit(app.db, {
      userId: staff.id,
      action: 'expense_category.delete',
      entity: 'expense_category',
      entityId: params.id,
      before,
    });
    return { ok: true as const };
  });

  // ---------- Settings ----------
  defineRoute(app, 'adminSettingsGet', async () => adminSettings(app));

  defineRoute(app, 'adminSettingsUpdate', async ({ body, staff }) => {
    if (body.currency?.main && body.currency.enabled && !body.currency.enabled.includes(body.currency.main))
      throw validationError('Mata uang utama harus aktif', [{ path: ['currency', 'main'] }]);
    const before = await adminSettings(app);
    await app.db.transaction(async (tx) => {
      const next = await patchSettings(tx, body);
      if (!next.currency.enabled.includes(next.currency.main))
        throw validationError('Mata uang utama harus aktif', [{ path: ['currency', 'main'] }]);
      await writeAudit(tx, {
        userId: staff.id,
        action: 'settings.update',
        entity: 'settings',
        before: Object.fromEntries(
          Object.keys(body).map((k) => [k, before.settings[k as keyof typeof before.settings]]),
        ),
        after: body,
      });
    });
    return adminSettings(app);
  });

  defineRoute(app, 'adminSettingsLogo', async ({ req, staff }) => {
    const file = await readImageUpload(req);
    const saved = await app.storage.save({ ...file, visibility: 'public', folder: 'logo' });
    await patchSettings(app.db, { profile: { logoUrl: saved.url } });
    await writeAudit(app.db, {
      userId: staff.id,
      action: 'settings.logo',
      entity: 'settings',
      after: { logoUrl: saved.url },
    });
    return adminSettings(app);
  });
}
