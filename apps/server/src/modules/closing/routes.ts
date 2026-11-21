import { eq, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { closings, driverSettlements, shifts } from '../../db/schema';
import { writeAudit } from '../../lib/audit';
import { getOpenShift } from '../../lib/business';
import { now } from '../../lib/clock';
import { conflict, notFound, unprocessable } from '../../lib/errors';
import { defineRoute } from '../../lib/route';
import { getSettings } from '../../lib/settings';
import { userNameMap } from '../orders/dto';
import { getShift } from '../shifts/service';
import { computePreview, getClosingDto, sumMain } from './service';

export default async function closingRoutes(app: FastifyInstance) {
  defineRoute(app, 'closingPreview', async ({ query }) => {
    const shift = query.shiftId ? await getShift(app.db, query.shiftId) : await getOpenShift(app.db);
    if (!shift) throw unprocessable('SHIFT_NOT_OPEN', 'Tidak ada shift terbuka');
    return computePreview(app.db, shift, await getSettings(app.db));
  });

  defineRoute(app, 'closingCreate', async ({ body, staff }) => {
    const settings = await getSettings(app.db);
    const result = await app.db.transaction(async (tx) => {
      const [shift] = await tx.select().from(shifts).where(eq(shifts.id, body.shiftId)).for('update');
      if (!shift) throw notFound('Shift tidak ditemukan');
      if (shift.closedAt) throw unprocessable('SHIFT_CLOSED', 'Shift sudah closing');
      const preview = await computePreview(tx, shift, settings);
      const cashByCurrency = body.actual.cashByCurrency;
      const actualCashMain = sumMain(cashByCurrency, settings);
      const diff = {
        cashMain: actualCashMain - preview.expected.cashMain,
        abaMain: body.actual.abaMain - preview.expected.abaMain,
      };
      const note = body.note?.trim() || null;
      if ((diff.cashMain !== 0 || diff.abaMain !== 0) && !note)
        throw unprocessable('CLOSING_NOTE_REQUIRED', 'Ada selisih: wajib isi catatan', diff);
      const at = now();
      const [existing] = await tx.select().from(closings).where(eq(closings.shiftId, shift.id));
      if (existing) throw conflict('CONFLICT', 'Shift sudah closing');
      await tx.insert(closings).values({
        shiftId: shift.id,
        expected: preview.expected,
        actual: {
          cashMain: actualCashMain,
          abaMain: body.actual.abaMain,
          cashByCurrency,
          ...(body.actual.denominations ? { denominations: body.actual.denominations } : {}),
        },
        diff,
        note,
        createdBy: staff.id,
        createdAt: at,
      });
      await tx.update(shifts).set({ closedAt: at }).where(eq(shifts.id, shift.id));
      await writeAudit(tx, {
        userId: staff.id,
        action: 'shift.close',
        entity: 'shift',
        entityId: shift.id,
        after: { expected: preview.expected, actualCashMain, abaMain: body.actual.abaMain, diff },
        reason: note,
      });
      return { preview: { ...preview, shift: { ...preview.shift, closedAt: at.toISOString() } } };
    });
    const closing = await getClosingDto(app.db, body.shiftId);
    return { closing: closing!, preview: result.preview };
  });

  defineRoute(app, 'driverSettlementSettle', async ({ params, staff }) => {
    const [row] = await app.db
      .update(driverSettlements)
      .set({ settledAt: sql`coalesce(${driverSettlements.settledAt}, now())`, settledBy: staff.id })
      .where(eq(driverSettlements.id, params.id))
      .returning();
    if (!row) throw notFound('Setoran tidak ditemukan');
    await writeAudit(app.db, {
      userId: staff.id,
      action: 'driver.settle',
      entity: 'driver_settlement',
      entityId: row.id,
      after: { cashCollected: row.cashCollected, deliveries: row.deliveries },
    });
    const names = await userNameMap(app.db, [row.driverId]);
    return {
      settlement: {
        id: row.id,
        shiftId: row.shiftId,
        driver: { id: row.driverId, name: names.get(row.driverId) ?? '?' },
        deliveries: row.deliveries,
        cashCollected: row.cashCollected,
        settledAt: row.settledAt?.toISOString() ?? null,
      },
    };
  });
}
