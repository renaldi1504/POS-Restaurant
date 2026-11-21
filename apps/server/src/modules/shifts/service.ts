import { eq } from 'drizzle-orm';
import type { ShiftDto } from '@pos/shared';
import type { DbOrTx } from '../../db/client';
import { shifts, users } from '../../db/schema';
import type { ShiftRow } from '../../lib/business';
import { notFound } from '../../lib/errors';

export async function toShiftDto(db: DbOrTx, s: ShiftRow): Promise<ShiftDto> {
  const [u] = await db.select({ id: users.id, name: users.name }).from(users).where(eq(users.id, s.userId));
  return {
    id: s.id,
    businessDate: s.businessDate,
    name: s.name,
    user: u ?? { id: s.userId, name: '?' },
    openedAt: s.openedAt.toISOString(),
    closedAt: s.closedAt?.toISOString() ?? null,
    openingCash: { KHR: s.openingCash.KHR ?? 0, USD: s.openingCash.USD ?? 0, IDR: s.openingCash.IDR ?? 0 },
  };
}

export async function getShift(db: DbOrTx, id: number): Promise<ShiftRow> {
  const [s] = await db.select().from(shifts).where(eq(shifts.id, id));
  if (!s) throw notFound('Shift tidak ditemukan');
  return s;
}
