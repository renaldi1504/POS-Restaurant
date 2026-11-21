/** Closing shift (SPEC §4.8): hitung seharusnya, selisih, ringkasan channel/metode, setoran driver. */
import { eq } from 'drizzle-orm';
import {
  ACTIVE_ORDER_STATUSES,
  convertMoney,
  CURRENCIES,
  ORDER_CHANNELS,
  PAYMENT_METHODS,
  percentOf,
  type ChannelSummary,
  type ClosingDto,
  type ClosingPreview,
  type Currency,
  type DriverSettlementDto,
  type MethodSummary,
  type OrderChannel,
  type Settings,
} from '@pos/shared';
import { seq } from '../../lib/seq';
import type { DbOrTx } from '../../db/client';
import { closings, driverSettlements, orders, payments } from '../../db/schema';
import type { ShiftRow } from '../../lib/business';
import { netMain, paymentCounts, userNameMap, type OrderRow, type PaymentRow } from '../orders/dto';
import { expenseTotals, loadExpenses } from '../expenses/service';
import { toShiftDto } from '../shifts/service';

const zero = (): Record<Currency, number> => ({ KHR: 0, USD: 0, IDR: 0 });

export function commissionPct(settings: Settings, channel: OrderChannel): number {
  if (channel === 'grab') return settings.commissions.grab;
  if (channel === 'foodpanda') return settings.commissions.foodpanda;
  return 0;
}

/** Ringkasan per channel (gross = subtotal + ongkir; net = gross − diskon − komisi). */
export function summarizeChannels(rows: OrderRow[], settings: Settings): ChannelSummary[] {
  return ORDER_CHANNELS.map((channel) => {
    const list = rows.filter((o) => o.channel === channel);
    const gross = list.reduce((a, o) => a + o.subtotal + o.deliveryFee, 0);
    const discount = list.reduce((a, o) => a + o.discount, 0);
    const commission = list.reduce((a, o) => a + percentOf(o.total, commissionPct(settings, channel)), 0);
    return { channel, count: list.length, gross, discount, commission, net: gross - discount - commission };
  });
}

/** Ringkasan per metode; cash: kembalian (mata uang utama) dikurangi dari mata uang utama. */
export function summarizeMethods(pays: PaymentRow[], settings: Settings): MethodSummary[] {
  const main = settings.currency.main;
  return PAYMENT_METHODS.map((method) => {
    const list = pays.filter((p) => p.method === method);
    const byCurrency = zero();
    for (const p of list) {
      byCurrency[p.currency] += p.amount;
      byCurrency[main] -= p.changeMain;
    }
    return { method, byCurrency, totalMain: list.reduce((a, p) => a + netMain(p), 0) };
  });
}

export const sumMain = (by: Record<Currency, number>, settings: Settings) =>
  CURRENCIES.reduce((a, c) => a + convertMoney(by[c], c, settings.currency.main, settings.currency.rates), 0);

/** Hitung & simpan (upsert) setoran driver untuk shift. */
async function driverSettlementsFor(
  db: DbOrTx,
  shift: ShiftRow,
  shiftOrders: OrderRow[],
  pays: PaymentRow[],
): Promise<DriverSettlementDto[]> {
  const delivered = shiftOrders.filter((o) => o.driverId && ['delivered', 'done'].includes(o.status));
  const orderDriver = new Map(shiftOrders.filter((o) => o.driverId).map((o) => [o.id, o.driverId!]));
  const stats = new Map<number, { deliveries: number; cash: number }>();
  for (const o of delivered) {
    const s = stats.get(o.driverId!) ?? { deliveries: 0, cash: 0 };
    s.deliveries++;
    stats.set(o.driverId!, s);
  }
  for (const p of pays) {
    if (p.method !== 'cash' || !p.orderId || !p.createdBy) continue;
    if (orderDriver.get(p.orderId) !== p.createdBy) continue;
    const s = stats.get(p.createdBy) ?? { deliveries: 0, cash: 0 };
    s.cash += netMain(p);
    stats.set(p.createdBy, s);
  }
  if (!shift.closedAt) {
    for (const [driverId, s] of stats) {
      await db
        .insert(driverSettlements)
        .values({ shiftId: shift.id, driverId, deliveries: s.deliveries, cashCollected: s.cash })
        .onConflictDoUpdate({
          target: [driverSettlements.shiftId, driverSettlements.driverId],
          set: { deliveries: s.deliveries, cashCollected: s.cash },
        });
    }
  }
  const rows = await db.select().from(driverSettlements).where(eq(driverSettlements.shiftId, shift.id));
  const names = await userNameMap(
    db,
    rows.map((r) => r.driverId),
  );
  return rows
    .sort((a, b) => a.id - b.id)
    .map((r) => ({
      id: r.id,
      shiftId: r.shiftId,
      driver: { id: r.driverId, name: names.get(r.driverId) ?? '?' },
      deliveries: r.deliveries,
      cashCollected: r.cashCollected,
      settledAt: r.settledAt?.toISOString() ?? null,
    }));
}

export async function computePreview(
  db: DbOrTx,
  shift: ShiftRow,
  settings: Settings,
): Promise<ClosingPreview> {
  const main = settings.currency.main;
  const [shiftOrders, allPays, expenseList] = await seq(
    () => db.select().from(orders).where(eq(orders.shiftId, shift.id)),
    () => db.select().from(payments).where(eq(payments.shiftId, shift.id)),
    () => loadExpenses(db, [shift.id]),
  );
  const pays = allPays.filter(paymentCounts);
  const valid = shiftOrders.filter((o) => o.status !== 'cancelled' && o.status !== 'rejected');
  const byMethod = summarizeMethods(pays, settings);
  const exp = expenseTotals(expenseList, settings);
  const opening = {
    KHR: shift.openingCash.KHR ?? 0,
    USD: shift.openingCash.USD ?? 0,
    IDR: shift.openingCash.IDR ?? 0,
  };
  const cash = byMethod.find((m) => m.method === 'cash')!;
  const aba = byMethod.find((m) => m.method === 'aba')!;
  const cashByCurrency = zero();
  for (const c of CURRENCIES) cashByCurrency[c] = opening[c] + cash.byCurrency[c] - exp.cashByCurrency[c];

  return {
    shift: await toShiftDto(db, shift),
    currency: main,
    openingCash: opening,
    openingCashMain: sumMain(opening, settings),
    orderCount: valid.length,
    cancelledCount: shiftOrders.length - valid.length,
    salesTotalMain: valid.reduce((a, o) => a + o.total, 0),
    byChannel: summarizeChannels(valid, settings),
    byMethod,
    expenses: {
      cashMain: exp.cashMain,
      abaMain: exp.abaMain,
      cashByCurrency: exp.cashByCurrency,
      count: expenseList.length,
    },
    expected: {
      cashMain: sumMain(cashByCurrency, settings),
      abaMain: aba.totalMain - exp.abaMain,
      cashByCurrency,
    },
    drivers: await driverSettlementsFor(db, shift, shiftOrders, pays),
    unpaidOrderCount: valid.filter((o) => o.paymentStatus !== 'paid').length,
    activeOrderCount: valid.filter((o) => (ACTIVE_ORDER_STATUSES as readonly string[]).includes(o.status))
      .length,
  };
}

export async function getClosingDto(db: DbOrTx, shiftId: number): Promise<ClosingDto | null> {
  const [c] = await db.select().from(closings).where(eq(closings.shiftId, shiftId));
  if (!c) return null;
  const names = await userNameMap(db, [c.createdBy]);
  return {
    shiftId: c.shiftId,
    expected: c.expected,
    actual: c.actual,
    diff: c.diff,
    note: c.note,
    createdBy: c.createdBy ? { id: c.createdBy, name: names.get(c.createdBy) ?? '?' } : null,
    createdAt: c.createdAt.toISOString(),
  };
}
