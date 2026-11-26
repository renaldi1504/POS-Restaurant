import type { FastifyInstance } from 'fastify';
import { sql } from 'drizzle-orm';
import { menuItems, options, shifts } from '../../db/schema';
import { writeAudit } from '../../lib/audit';
import { currentBusinessDate, getOpenShift } from '../../lib/business';
import { now } from '../../lib/clock';
import { conflict, unprocessable } from '../../lib/errors';
import { defineRoute } from '../../lib/route';
import { getSettings } from '../../lib/settings';
import { lastClosingKept, toShiftDto } from './service';

export default async function shiftsRoutes(app: FastifyInstance) {
  defineRoute(app, 'shiftOpen', async ({ body, staff }) => {
    const settings = await getSettings(app.db);
    const at = now();
    const shift = await app.db.transaction(async (tx) => {
      // Serialisasi buka shift bersamaan.
      await tx.execute(sql`select pg_advisory_xact_lock(424242)`);
      const open = await getOpenShift(tx);
      if (open) throw conflict('SHIFT_ALREADY_OPEN', `Shift "${open.name}" masih terbuka, closing dulu`);
      // Modal harus sama dengan uang yang ditinggal di laci saat closing terakhir — kalau beda, wajib catatan.
      const last = await lastClosingKept(tx);
      const note = body.note?.trim() || null;
      // Laci dikosongkan saat closing (semua disetor) → modal baru dari owner, tidak perlu dicocokkan.
      const leftInDrawer = !!last && Object.values(last.expected).some((v) => v > 0);
      const differs =
        leftInDrawer &&
        (['KHR', 'USD', 'IDR'] as const).some((c) => (body.openingCash[c] ?? 0) !== last!.expected[c]);
      if (differs && !note)
        throw unprocessable(
          'OPENING_NOTE_REQUIRED',
          'Modal awal beda dengan sisa closing terakhir, isi catatan',
          {
            expected: last.expected,
          },
        );
      const [s] = await tx
        .insert(shifts)
        .values({
          businessDate: currentBusinessDate(settings, at),
          userId: staff.id,
          name: body.name,
          openedAt: at,
          openingCash: body.openingCash,
          openingDenominations: body.denominations ?? null,
          openingExpected: last?.expected ?? null,
          openingNote: note,
        })
        .returning();
      if (settings.shift.autoAvailableOnOpen) {
        await tx.update(menuItems).set({ available: true, updatedAt: at });
        await tx.update(options).set({ available: true });
      }
      await writeAudit(tx, {
        userId: staff.id,
        action: 'shift.open',
        entity: 'shift',
        entityId: s!.id,
        after: {
          name: body.name,
          openingCash: body.openingCash,
          openingExpected: last?.expected ?? null,
          businessDate: s!.businessDate,
        },
        reason: note,
      });
      return s!;
    });
    return { shift: await toShiftDto(app.db, shift) };
  });

  defineRoute(app, 'shiftOpeningSuggestion', async () => {
    const last = await lastClosingKept(app.db);
    return last ?? { expected: null, fromShift: null };
  });

  defineRoute(app, 'shiftCurrent', async () => {
    const s = await getOpenShift(app.db);
    return { shift: s ? await toShiftDto(app.db, s) : null };
  });
}
