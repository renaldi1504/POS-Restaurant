/** Dashboard harian (SPEC §4.12). */
import { and, asc, eq, gte, inArray, lt } from 'drizzle-orm';
import {
  addDays,
  businessDate,
  businessDayRange,
  convertMoney,
  type RangeReport,
  type RangeTotals,
  localHour,
  parseHHMM,
  type DailyReport,
  type LocalizedText,
  type Settings,
} from '@pos/shared';
import type { DbOrTx } from '../../db/client';
import { orderItems, orders, payments, shifts } from '../../db/schema';
import { summarizeChannels, summarizeMethods } from '../closing/service';
import { expenseTotals, loadExpenses, loadExpensesBetween } from '../expenses/service';
import { paymentCounts } from '../orders/dto';
import { toShiftDto } from '../shifts/service';

/** Urutan jam hari operasional: mulai jam buka, 24 jam. */
export function businessHoursOrder(settings: Settings): number[] {
  const start = Math.floor(parseHHMM(settings.hours.open) / 60);
  return Array.from({ length: 24 }, (_, i) => (start + i) % 24);
}

export async function dailyReport(db: DbOrTx, date: string, settings: Settings): Promise<DailyReport> {
  const main = settings.currency.main;
  const range = businessDayRange(date, settings.hours);
  const [dayOrders, dayShifts, dayPays] = await Promise.all([
    db.select().from(orders).where(eq(orders.businessDate, date)),
    db.select().from(shifts).where(eq(shifts.businessDate, date)).orderBy(asc(shifts.openedAt)),
    db
      .select()
      .from(payments)
      .where(and(gte(payments.createdAt, range.start), lt(payments.createdAt, range.end))),
  ]);
  const cancelled = dayOrders.filter((o) => o.status === 'cancelled' || o.status === 'rejected');
  // Penjualan = order selesai / terbayar (tidak termasuk batal/tolak).
  const counted = dayOrders.filter(
    (o) =>
      o.status !== 'cancelled' &&
      o.status !== 'rejected' &&
      (o.paymentStatus === 'paid' || o.status === 'done'),
  );
  const byChannel = summarizeChannels(counted, settings);
  const totalSales = counted.reduce((a, o) => a + o.total, 0);
  const netSales = byChannel.reduce((a, c) => a + c.net, 0);

  const hourTotals = new Map<number, { total: number; count: number }>();
  for (const o of counted) {
    const h = localHour(o.createdAt);
    const b = hourTotals.get(h) ?? { total: 0, count: 0 };
    b.total += o.total;
    b.count++;
    hourTotals.set(h, b);
  }
  const open = Math.floor(parseHHMM(settings.hours.open) / 60);
  const closeMin = parseHHMM(settings.hours.close);
  const close = Math.ceil(closeMin / 60);
  const inHours = (h: number) =>
    open === close % 24 ? true : close > open ? h >= open && h < close : h >= open || h < close;
  const byHour = businessHoursOrder(settings)
    .filter((h) => inHours(h) || hourTotals.has(h))
    .map((hour) => ({
      hour,
      total: hourTotals.get(hour)?.total ?? 0,
      count: hourTotals.get(hour)?.count ?? 0,
    }));

  const countedIds = counted.map((o) => o.id);
  const items = countedIds.length
    ? await db.select().from(orderItems).where(inArray(orderItems.orderId, countedIds))
    : [];
  const top = new Map<string, { itemId: number | null; name: LocalizedText; qty: number; total: number }>();
  for (const i of items) {
    const key = i.itemId ? `i${i.itemId}` : `n${i.nameSnapshot.id}`;
    const t = top.get(key) ?? { itemId: i.itemId, name: i.nameSnapshot, qty: 0, total: 0 };
    t.qty += i.qty;
    t.total += i.lineTotal;
    top.set(key, t);
  }
  const topItems = [...top.values()].sort((a, b) => b.qty - a.qty || b.total - a.total).slice(0, 10);

  const expenseList = await loadExpenses(
    db,
    dayShifts.map((s) => s.id),
  );
  const exp = expenseTotals(expenseList, settings);

  return {
    date,
    currency: main,
    totalSales,
    netSales,
    orderCount: counted.length,
    averageOrder: counted.length ? Math.round(totalSales / counted.length) : 0,
    expensesTotal: exp.cashMain + exp.abaMain,
    cancelledCount: cancelled.length,
    byHour,
    byChannel,
    byMethod: summarizeMethods(dayPays.filter(paymentCounts), settings),
    topItems,
    shifts: await Promise.all(dayShifts.map((s) => toShiftDto(db, s))),
  };
}

const MAX_RANGE_DAYS = 400;

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
}

const countedOrder = (o: { status: string; paymentStatus: string }) =>
  o.status !== 'cancelled' && o.status !== 'rejected' && (o.paymentStatus === 'paid' || o.status === 'done');

/**
 * Laporan owner memakai WAKTU order/pengeluaran (bukan tanggal shift): bila shift lupa di-closing,
 * order hari ini tetap tercatat di hari ini.
 */
function timeWindow(from: string, to: string, settings: Settings): { start: Date; end: Date } {
  return {
    start: businessDayRange(from, settings.hours).start,
    end: businessDayRange(to, settings.hours).end,
  };
}

function ordersBetween(db: DbOrTx, start: Date, end: Date) {
  return db
    .select()
    .from(orders)
    .where(and(gte(orders.createdAt, start), lt(orders.createdAt, end)));
}

const isUnpaidOpen = (o: { status: string; paymentStatus: string }) =>
  o.status !== 'cancelled' && o.status !== 'rejected' && !countedOrder(o);

/** Total singkat suatu rentang (untuk perbandingan periode sebelumnya). */
async function rangeTotals(db: DbOrTx, from: string, to: string, settings: Settings): Promise<RangeTotals> {
  const { start, end } = timeWindow(from, to, settings);
  const [rangeOrders, rangeExpenses] = await Promise.all([
    ordersBetween(db, start, end),
    loadExpensesBetween(db, start, end),
  ]);
  const counted = rangeOrders.filter(countedOrder);
  const netSales = summarizeChannels(counted, settings).reduce((a, c) => a + c.net, 0);
  const exp = expenseTotals(rangeExpenses, settings);
  const expensesTotal = exp.cashMain + exp.abaMain;
  return {
    totalSales: counted.reduce((a, o) => a + o.total, 0),
    netSales,
    expensesTotal,
    grossProfit: netSales - expensesTotal,
    orderCount: counted.length,
  };
}

/** Laporan owner untuk rentang hari operasional [from, to] (inklusif). */
export async function rangeReport(
  db: DbOrTx,
  from: string,
  to: string,
  settings: Settings,
): Promise<RangeReport> {
  const days = daysBetween(from, to);
  if (days > MAX_RANGE_DAYS) throw new Error('RANGE_TOO_LONG');
  const main = settings.currency.main;
  const { start, end } = timeWindow(from, to, settings);
  const [rangeOrders, expenseList, rangePays] = await Promise.all([
    ordersBetween(db, start, end),
    loadExpensesBetween(db, start, end),
    db
      .select()
      .from(payments)
      .where(and(gte(payments.createdAt, start), lt(payments.createdAt, end))),
  ]);
  const dayOf = (d: Date | string) => businessDate(new Date(d), settings.hours);
  const unpaid = rangeOrders.filter(isUnpaidOpen);
  const counted = rangeOrders.filter(countedOrder);
  const cancelledCount = rangeOrders.filter(
    (o) => o.status === 'cancelled' || o.status === 'rejected',
  ).length;
  const byChannel = summarizeChannels(counted, settings);
  const totalSales = counted.reduce((a, o) => a + o.total, 0);
  const netSales = byChannel.reduce((a, c) => a + c.net, 0);

  const exp = expenseTotals(expenseList, settings);
  const expensesTotal = exp.cashMain + exp.abaMain;

  // Per hari
  const dayMap = new Map<string, { sales: number; expenses: number; orders: number }>();
  for (let d = from; d <= to; d = addDays(d, 1)) dayMap.set(d, { sales: 0, expenses: 0, orders: 0 });
  for (const o of counted) {
    const b = dayMap.get(dayOf(o.createdAt));
    if (b) {
      b.sales += o.total;
      b.orders++;
    }
  }
  const byCategory = new Map<string, { total: number; count: number }>();
  for (const e of expenseList) {
    const m = convertMoney(e.amount, e.currency, main, settings.currency.rates);
    const b = dayMap.get(dayOf(e.createdAt));
    if (b) b.expenses += m;
    const c = byCategory.get(e.category.name) ?? { total: 0, count: 0 };
    c.total += m;
    c.count++;
    byCategory.set(e.category.name, c);
  }

  // Menu terlaris
  const ids = counted.map((o) => o.id);
  const items = ids.length ? await db.select().from(orderItems).where(inArray(orderItems.orderId, ids)) : [];
  const top = new Map<string, { itemId: number | null; name: LocalizedText; qty: number; total: number }>();
  for (const i of items) {
    const key = i.itemId ? `i${i.itemId}` : `n${i.nameSnapshot.id}`;
    const t = top.get(key) ?? { itemId: i.itemId, name: i.nameSnapshot, qty: 0, total: 0 };
    t.qty += i.qty;
    t.total += i.lineTotal;
    top.set(key, t);
  }

  const prevTo = addDays(from, -1);
  const prevFrom = addDays(prevTo, -(days - 1));
  return {
    from,
    to,
    days,
    currency: main,
    totalSales,
    netSales,
    expensesTotal,
    grossProfit: netSales - expensesTotal,
    orderCount: counted.length,
    averageOrder: counted.length ? Math.round(totalSales / counted.length) : 0,
    cancelledCount,
    unpaid: { count: unpaid.length, total: unpaid.reduce((a, o) => a + o.total, 0) },
    byDay: [...dayMap.entries()].map(([date, v]) => ({ date, ...v })),
    byChannel,
    byMethod: summarizeMethods(rangePays.filter(paymentCounts), settings),
    topItems: [...top.values()].sort((a, b) => b.qty - a.qty || b.total - a.total).slice(0, 20),
    expensesByCategory: [...byCategory.entries()]
      .map(([category, v]) => ({ category, ...v }))
      .sort((a, b) => b.total - a.total),
    previous: { from: prevFrom, to: prevTo, ...(await rangeTotals(db, prevFrom, prevTo, settings)) },
  };
}
