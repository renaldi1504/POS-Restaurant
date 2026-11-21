import type { FastifyInstance } from 'fastify';
import { sql } from 'drizzle-orm';
import { menuItems, options, shifts } from '../../db/schema';
import { writeAudit } from '../../lib/audit';
import { currentBusinessDate, getOpenShift } from '../../lib/business';
import { now } from '../../lib/clock';
import { conflict } from '../../lib/errors';
import { defineRoute } from '../../lib/route';
import { getSettings } from '../../lib/settings';
import { toShiftDto } from './service';

export default async function shiftsRoutes(app: FastifyInstance) {
  defineRoute(app, 'shiftOpen', async ({ body, staff }) => {
    const settings = await getSettings(app.db);
    const at = now();
    const shift = await app.db.transaction(async (tx) => {
      // Serialisasi buka shift bersamaan.
      await tx.execute(sql`select pg_advisory_xact_lock(424242)`);
      const open = await getOpenShift(tx);
      if (open) throw conflict('SHIFT_ALREADY_OPEN', `Shift "${open.name}" masih terbuka, closing dulu`);
      const [s] = await tx
        .insert(shifts)
        .values({
          businessDate: currentBusinessDate(settings, at),
          userId: staff.id,
          name: body.name,
          openedAt: at,
          openingCash: body.openingCash,
          openingDenominations: body.denominations ?? null,
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
        after: { name: body.name, openingCash: body.openingCash, businessDate: s!.businessDate },
      });
      return s!;
    });
    return { shift: await toShiftDto(app.db, shift) };
  });

  defineRoute(app, 'shiftCurrent', async () => {
    const s = await getOpenShift(app.db);
    return { shift: s ? await toShiftDto(app.db, s) : null };
  });
}
