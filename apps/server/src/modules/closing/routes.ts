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
      // Uang cash yang masih dipegang driver harus disetor dulu (sudah dihitung "seharusnya di laci").
      const unsettled = preview.drivers.filter((d) => !d.settledAt && d.cashCollected > 0);
      if (unsettled.length)
        throw unprocessable('CLOSING_DRIVERS_UNSETTLED', 'Masih ada uang di driver yang belum disetor', {
          drivers: unsettled.map((d) => d.driver.name),
        });
      const cashByCurrency = body.actual.cashByCurrency;
      const actualCashMain = sumMain(cashByCurrency, settings);
      const abaByCurrency = body.actual.abaByCurrency;
      const abaActualMain = abaByCurrency ? sumMain(abaByCurrency, settings) : (body.actual.abaMain ?? 0);
      // Selisih per kantong — tanpa konversi kurs, jadi tidak ada selisih karena kurs/pembulatan.
      const pockets = preview.pockets.map((pk) => {
        const actual =
          pk.method === 'cash' ? (cashByCurrency[pk.currency] ?? 0) : (abaByCurrency?.[pk.currency] ?? 0);
        return {
          method: pk.method,
          currency: pk.currency,
          expected: pk.expected,
          actual,
          diff: actual - pk.expected,
        };
      });
      const diff = {
        cashMain: actualCashMain - preview.expected.cashMain,
        abaMain: abaActualMain - preview.expected.abaMain,
        pockets,
      };
      const hasDiff = abaByCurrency
        ? pockets.some((pk) => pk.diff !== 0)
        : pockets.some((pk) => pk.method === 'cash' && pk.diff !== 0) || diff.abaMain !== 0;
      const note = body.note?.trim() || null;
      if (hasDiff && !note)
        throw unprocessable('CLOSING_NOTE_REQUIRED', 'Ada selisih: wajib isi catatan', {
          cashMain: diff.cashMain,
          abaMain: diff.abaMain,
        });
      // Ditinggal di laci (modal shift berikutnya) ≤ uang fisik; sisanya disetor ke owner.
      const kept = { KHR: 0, USD: 0, IDR: 0 };
      const deposit = { KHR: 0, USD: 0, IDR: 0 };
      for (const c of ['KHR', 'USD', 'IDR'] as const) {
        const counted = cashByCurrency[c] ?? 0;
        const want = body.kept ? (body.kept[c] ?? 0) : Math.min(preview.suggestedKeep[c] ?? 0, counted);
        if (want > counted)
          throw unprocessable('VALIDATION_ERROR', 'Uang yang ditinggal melebihi uang fisik', { currency: c });
        kept[c] = want;
        deposit[c] = counted - want;
      }
      const at = now();
      const [existing] = await tx.select().from(closings).where(eq(closings.shiftId, shift.id));
      if (existing) throw conflict('CONFLICT', 'Shift sudah closing');
      await tx.insert(closings).values({
        shiftId: shift.id,
        expected: preview.expected,
        actual: {
          cashMain: actualCashMain,
          abaMain: abaActualMain,
          cashByCurrency,
          ...(body.actual.denominations ? { denominations: body.actual.denominations } : {}),
          ...(abaByCurrency ? { abaByCurrency } : {}),
          kept,
          deposit,
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
        after: { pockets, kept, deposit, actualCashMain, abaMain: abaActualMain },
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
