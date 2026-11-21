import { and, asc, eq, sql } from 'drizzle-orm';
import { PIN_LOCK_MINUTES, PIN_MAX_ATTEMPTS, type LoginUserCard } from '@pos/shared';
import type { Db } from '../../db/client';
import { roles, users } from '../../db/schema';
import { writeAudit } from '../../lib/audit';
import { AppError } from '../../lib/errors';
import { verifyPin } from '../../lib/pin';

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length >= 2 ? parts[0]![0]! + parts[1]![0]! : (parts[0] ?? '?').slice(0, 2);
  return letters.toUpperCase();
}

/** Kartu login: user aktif & bukan sistem, urut id. */
export async function listLoginUsers(db: Db): Promise<LoginUserCard[]> {
  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      roleId: roles.id,
      roleName: roles.name,
      lockedUntil: users.lockedUntil,
    })
    .from(users)
    .innerJoin(roles, eq(roles.id, users.roleId))
    .where(and(eq(users.active, true), eq(users.system, false)))
    .orderBy(asc(users.id));
  const now = Date.now();
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    roleId: r.roleId,
    roleName: r.roleName,
    initials: initialsOf(r.name),
    locked: !!r.lockedUntil && r.lockedUntil.getTime() > now,
  }));
}

/**
 * Verifikasi PIN dengan penguncian: 5x salah → terkunci 5 menit (423 PIN_LOCKED).
 * Return id user bila berhasil.
 */
export async function verifyLogin(db: Db, userId: number, pin: string): Promise<number> {
  const [u] = await db
    .select({
      id: users.id,
      pinHash: users.pinHash,
      active: users.active,
      system: users.system,
      lockedUntil: users.lockedUntil,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!u || !u.active || u.system || !u.pinHash) {
    throw new AppError(401, 'PIN_INVALID', 'Pengguna atau PIN salah');
  }
  if (u.lockedUntil && u.lockedUntil.getTime() > Date.now()) {
    throw new AppError(423, 'PIN_LOCKED', 'Terlalu banyak salah, akun terkunci sementara', {
      lockedUntil: u.lockedUntil.toISOString(),
    });
  }
  const ok = await verifyPin(u.pinHash, pin);
  if (!ok) {
    const [after] = await db
      .update(users)
      .set({ failedAttempts: sql`${users.failedAttempts} + 1` })
      .where(eq(users.id, userId))
      .returning({ failedAttempts: users.failedAttempts });
    const attempts = after?.failedAttempts ?? PIN_MAX_ATTEMPTS;
    if (attempts >= PIN_MAX_ATTEMPTS) {
      const lockedUntil = new Date(Date.now() + PIN_LOCK_MINUTES * 60_000);
      await db.update(users).set({ failedAttempts: 0, lockedUntil }).where(eq(users.id, userId));
      await writeAudit(db, { userId, action: 'auth.locked', entity: 'user', entityId: userId });
      throw new AppError(423, 'PIN_LOCKED', 'Terlalu banyak salah, akun terkunci 5 menit', {
        lockedUntil: lockedUntil.toISOString(),
      });
    }
    throw new AppError(401, 'PIN_INVALID', 'PIN salah', { remainingAttempts: PIN_MAX_ATTEMPTS - attempts });
  }
  await db.update(users).set({ failedAttempts: 0, lockedUntil: null }).where(eq(users.id, userId));
  await writeAudit(db, { userId, action: 'auth.login', entity: 'user', entityId: userId });
  return userId;
}
