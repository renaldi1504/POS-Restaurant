import { and, asc, eq, gte, inArray, lt, type SQL } from 'drizzle-orm';
import { convertMoney, type ExpenseDto, type Settings } from '@pos/shared';
import type { DbOrTx } from '../../db/client';
import { expenseCategories, expenses } from '../../db/schema';
import { userNameMap } from '../orders/dto';

export type ExpenseRow = typeof expenses.$inferSelect;

export async function loadExpenses(db: DbOrTx, shiftIds: number[]): Promise<ExpenseDto[]> {
  if (!shiftIds.length) return [];
  return loadExpensesWhere(db, inArray(expenses.shiftId, shiftIds));
}

/** Pengeluaran menurut waktu input [start, end) — tidak bergantung tanggal shift (laporan owner). */
export async function loadExpensesBetween(db: DbOrTx, start: Date, end: Date): Promise<ExpenseDto[]> {
  return loadExpensesWhere(db, and(gte(expenses.createdAt, start), lt(expenses.createdAt, end))!);
}

async function loadExpensesWhere(db: DbOrTx, where: SQL): Promise<ExpenseDto[]> {
  const rows = await db
    .select({ e: expenses, c: expenseCategories })
    .from(expenses)
    .innerJoin(expenseCategories, eq(expenseCategories.id, expenses.categoryId))
    .where(where)
    .orderBy(asc(expenses.createdAt), asc(expenses.id));
  const names = await userNameMap(
    db,
    rows.map((r) => r.e.createdBy),
  );
  return rows.map(({ e, c }) => ({
    id: e.id,
    shiftId: e.shiftId,
    category: { id: c.id, name: c.name },
    amount: e.amount,
    currency: e.currency,
    source: e.source,
    note: e.note,
    photoUrl: e.photoUrl,
    createdBy: e.createdBy ? { id: e.createdBy, name: names.get(e.createdBy) ?? '?' } : null,
    createdAt: e.createdAt.toISOString(),
  }));
}

export function expenseTotals(
  list: Pick<ExpenseDto, 'amount' | 'currency' | 'source'>[],
  settings: Settings,
) {
  const main = settings.currency.main;
  const rates = settings.currency.rates;
  const cashByCurrency = { KHR: 0, USD: 0, IDR: 0 };
  let cashMain = 0;
  let abaMain = 0;
  for (const e of list) {
    const m = convertMoney(e.amount, e.currency, main, rates);
    if (e.source === 'cash') {
      cashMain += m;
      cashByCurrency[e.currency] += e.amount;
    } else abaMain += m;
  }
  return { cashMain, abaMain, cashByCurrency };
}
