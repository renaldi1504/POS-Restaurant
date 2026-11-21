/** Helper hari operasional & shift (dipakai banyak modul). */
import { businessDate, type Settings } from '@pos/shared';
import { desc, isNull } from 'drizzle-orm';
import type { DbOrTx } from '../db/client';
import { shifts } from '../db/schema';
import { now } from './clock';

export type ShiftRow = typeof shifts.$inferSelect;

/** Shift yang sedang terbuka (paling baru). */
export async function getOpenShift(db: DbOrTx): Promise<ShiftRow | null> {
  const [s] = await db
    .select()
    .from(shifts)
    .where(isNull(shifts.closedAt))
    .orderBy(desc(shifts.openedAt))
    .limit(1);
  return s ?? null;
}

/** business_date berjalan menurut jam operasional settings. */
export function currentBusinessDate(settings: Settings, at: Date = now()): string {
  return businessDate(at, settings.hours);
}
