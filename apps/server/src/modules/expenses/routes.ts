import { and, asc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { expenseCategories, expenses, shifts } from '../../db/schema';
import { writeAudit } from '../../lib/audit';
import { getOpenShift } from '../../lib/business';
import { now } from '../../lib/clock';
import { unprocessable, validationError } from '../../lib/errors';
import { defineRoute } from '../../lib/route';
import { getSettings } from '../../lib/settings';
import { readImageUpload } from '../../lib/upload';
import { expenseTotals, loadExpenses } from './service';

export default async function expensesRoutes(app: FastifyInstance) {
  defineRoute(app, 'expenseCategories', async () => {
    const rows = await app.db
      .select({ id: expenseCategories.id, name: expenseCategories.name })
      .from(expenseCategories)
      .where(eq(expenseCategories.active, true))
      .orderBy(asc(expenseCategories.id));
    return { categories: rows };
  });

  defineRoute(app, 'expensesList', async ({ query }) => {
    let shiftIds: number[] = [];
    if (query.shiftId) shiftIds = [query.shiftId];
    else if (query.date) {
      const rows = await app.db
        .select({ id: shifts.id })
        .from(shifts)
        .where(eq(shifts.businessDate, query.date));
      shiftIds = rows.map((r) => r.id);
    } else {
      const open = await getOpenShift(app.db);
      if (open) shiftIds = [open.id];
    }
    const list = await loadExpenses(app.db, shiftIds);
    const t = expenseTotals(list, await getSettings(app.db));
    return { expenses: list, totalCashMain: t.cashMain, totalAbaMain: t.abaMain };
  });

  defineRoute(app, 'expenseCreate', async ({ body, staff }) => {
    const shift = await getOpenShift(app.db);
    if (!shift) throw unprocessable('SHIFT_NOT_OPEN', 'Buka shift dulu');
    const settings = await getSettings(app.db);
    if (!settings.currency.enabled.includes(body.currency))
      throw validationError(`Mata uang ${body.currency} tidak aktif`, [{ path: ['currency'] }]);
    const [cat] = await app.db
      .select()
      .from(expenseCategories)
      .where(and(eq(expenseCategories.id, body.categoryId), eq(expenseCategories.active, true)));
    if (!cat) throw validationError('Kategori tidak ditemukan', [{ path: ['categoryId'] }]);
    const [row] = await app.db
      .insert(expenses)
      .values({
        shiftId: shift.id,
        categoryId: body.categoryId,
        amount: body.amount,
        currency: body.currency,
        source: body.source,
        note: body.note?.trim() || null,
        photoUrl: body.photoUrl ?? null,
        createdBy: staff.id,
        createdAt: now(),
      })
      .returning();
    await writeAudit(app.db, {
      userId: staff.id,
      action: 'expense.create',
      entity: 'expense',
      entityId: row!.id,
      after: body,
    });
    const [dto] = (await loadExpenses(app.db, [shift.id])).filter((e) => e.id === row!.id);
    return { expense: dto! };
  });

  defineRoute(app, 'expensePhoto', async ({ req }) => {
    const file = await readImageUpload(req);
    const saved = await app.storage.save({ ...file, visibility: 'private', folder: 'expenses' });
    return { url: saved.url };
  });
}
