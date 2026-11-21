/** Admin: pengguna (PIN argon2, nonaktif → cabut sesi), role (sistem tidak bisa dihapus), settings. */
import { and, asc, count, eq, ne } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import {
  PermissionKey,
  type AdminSettingsResponse,
  type AdminUserDto,
  type Lang,
  type RoleDto,
} from '@pos/shared';
import type { DbOrTx } from '../../db/client';
import { roles, users } from '../../db/schema';
import { conflict, notFound } from '../../lib/errors';
import { getSettings } from '../../lib/settings';

type RoleRow = typeof roles.$inferSelect;

export async function loadUsers(db: DbOrTx, id?: number): Promise<AdminUserDto[]> {
  const rows = await db
    .select({ u: users, r: roles })
    .from(users)
    .innerJoin(roles, eq(roles.id, users.roleId))
    .where(id ? eq(users.id, id) : undefined)
    .orderBy(asc(users.id));
  return rows.map(({ u, r }) => ({
    id: u.id,
    name: u.name,
    role: { id: r.id, name: r.name },
    lang: u.lang as Lang,
    active: u.active,
    system: u.system,
    lockedUntil: u.lockedUntil && u.lockedUntil.getTime() > Date.now() ? u.lockedUntil.toISOString() : null,
    failedAttempts: u.failedAttempts,
  }));
}

export async function getUserDto(db: DbOrTx, id: number): Promise<AdminUserDto> {
  const [u] = await loadUsers(db, id);
  if (!u) throw notFound('Pengguna tidak ditemukan');
  return u;
}

export function toRoleDto(r: RoleRow, userCount: number): RoleDto {
  return {
    id: r.id,
    name: r.name,
    permissions: (r.permissions ?? []).filter((p): p is PermissionKey => PermissionKey.safeParse(p).success),
    system: r.system,
    userCount,
  };
}

export async function loadRoles(db: DbOrTx, id?: number): Promise<RoleDto[]> {
  const rows = await db
    .select()
    .from(roles)
    .where(id ? eq(roles.id, id) : undefined)
    .orderBy(asc(roles.id));
  const counts = await db.select({ roleId: users.roleId, n: count() }).from(users).groupBy(users.roleId);
  return rows.map((r) => toRoleDto(r, counts.find((c) => c.roleId === r.id)?.n ?? 0));
}

export async function getRoleDto(db: DbOrTx, id: number): Promise<RoleDto> {
  const [r] = await loadRoles(db, id);
  if (!r) throw notFound('Role tidak ditemukan');
  return r;
}

/**
 * Pastikan setelah perubahan masih ada ≥1 user aktif (non-sistem) dengan users.manage.
 * `simulate`: user/role yang akan berubah.
 */
export async function assertOwnerRemains(
  db: DbOrTx,
  simulate: {
    userId?: number;
    active?: boolean;
    roleId?: number;
    roleIdPerms?: { roleId: number; permissions: string[] };
  },
): Promise<void> {
  const rows = await db
    .select({ id: users.id, active: users.active, roleId: users.roleId, permissions: roles.permissions })
    .from(users)
    .innerJoin(roles, eq(roles.id, users.roleId))
    .where(and(eq(users.system, false)));
  const allRoles = await db.select({ id: roles.id, permissions: roles.permissions }).from(roles);
  const permsOf = (roleId: number) => {
    if (simulate.roleIdPerms && simulate.roleIdPerms.roleId === roleId)
      return simulate.roleIdPerms.permissions;
    return allRoles.find((r) => r.id === roleId)?.permissions ?? [];
  };
  const remaining = rows.filter((u) => {
    const active = simulate.userId === u.id && simulate.active !== undefined ? simulate.active : u.active;
    const roleId = simulate.userId === u.id && simulate.roleId !== undefined ? simulate.roleId : u.roleId;
    return active && permsOf(roleId).includes('users.manage');
  });
  if (!remaining.length) throw conflict('CONFLICT', 'Harus ada minimal satu owner/admin aktif');
}

export async function roleNameTaken(db: DbOrTx, name: string, exceptId?: number) {
  const [r] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(exceptId ? and(eq(roles.name, name), ne(roles.id, exceptId)) : eq(roles.name, name));
  return !!r;
}

export async function adminSettings(app: FastifyInstance): Promise<AdminSettingsResponse> {
  const f = app.config.features;
  return {
    settings: await getSettings(app.db),
    integrations: {
      telegram: f.telegram,
      telegramBotUsername: app.config.TELEGRAM_BOT_USERNAME ?? null,
      gemini: f.gemini,
      maps: f.maps,
      r2: f.r2,
    },
  };
}
