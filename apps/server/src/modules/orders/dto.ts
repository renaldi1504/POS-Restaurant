/** Muat order lengkap (OrderDto) secara batch + konversi ke PublicOrderDto. */
import { asc, eq, inArray, type SQL } from 'drizzle-orm';
import type { OrderDto, PaymentDto, PublicOrderDto } from '@pos/shared';
import { seq } from '../../lib/seq';
import type { DbOrTx } from '../../db/client';
import {
  addresses,
  customers,
  dineTables,
  orderItems,
  orders,
  payments,
  tableSessions,
  users,
} from '../../db/schema';
import { notFound } from '../../lib/errors';

export type OrderRow = typeof orders.$inferSelect;
export type PaymentRow = typeof payments.$inferSelect;

/** Pembayaran yang dihitung: tidak dibatalkan, dan (bukan bukti ABA ATAU sudah diverifikasi). */
export function paymentCounts(p: Pick<PaymentRow, 'voidedAt' | 'proofUrl' | 'verifiedAt'>): boolean {
  return !p.voidedAt && (!p.proofUrl || !!p.verifiedAt);
}
export const netMain = (p: Pick<PaymentRow, 'amountMain' | 'changeMain'>) => p.amountMain - p.changeMain;

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

export function toPaymentDto(p: PaymentRow, userNames: Map<number, string>): PaymentDto {
  const ref = (id: number | null) => (id ? { id, name: userNames.get(id) ?? '?' } : null);
  return {
    id: p.id,
    orderId: p.orderId,
    tableSessionId: p.tableSessionId,
    method: p.method,
    currency: p.currency,
    amount: p.amount,
    amountMain: p.amountMain,
    changeMain: p.changeMain,
    proofUrl: p.proofUrl,
    verifiedBy: ref(p.verifiedBy),
    verifiedAt: iso(p.verifiedAt),
    createdBy: ref(p.createdBy),
    createdAt: p.createdAt.toISOString(),
  };
}

export async function userNameMap(
  db: DbOrTx,
  ids: (number | null | undefined)[],
): Promise<Map<number, string>> {
  const unique = [...new Set(ids.filter((x): x is number => typeof x === 'number'))];
  if (!unique.length) return new Map();
  const rows = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(inArray(users.id, unique));
  return new Map(rows.map((r) => [r.id, r.name]));
}

export interface LoadOptions {
  orderBy?: SQL | SQL[];
  limit?: number;
}

export async function loadOrderDtos(
  db: DbOrTx,
  where: SQL | undefined,
  opts: LoadOptions = {},
): Promise<OrderDto[]> {
  let q = db
    .select()
    .from(orders)
    .where(where)
    .orderBy(...(opts.orderBy ? [opts.orderBy].flat() : [asc(orders.createdAt), asc(orders.number)]))
    .$dynamic();
  if (opts.limit) q = q.limit(opts.limit);
  const rows = await q;
  return hydrate(db, rows);
}

export async function hydrate(db: DbOrTx, rows: OrderRow[]): Promise<OrderDto[]> {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const sessionIds = [...new Set(rows.map((r) => r.tableSessionId).filter((x): x is number => !!x))];
  const customerIds = [...new Set(rows.map((r) => r.customerId).filter((x): x is number => !!x))];
  const addressIds = [...new Set(rows.map((r) => r.addressId).filter((x): x is number => !!x))];

  const [items, pays, sess, custs, addrs] = await seq(
    () => db.select().from(orderItems).where(inArray(orderItems.orderId, ids)).orderBy(asc(orderItems.id)),
    () => db.select().from(payments).where(inArray(payments.orderId, ids)).orderBy(asc(payments.id)),
    () =>
      sessionIds.length
        ? db
            .select({ id: tableSessions.id, tableId: dineTables.id, tableName: dineTables.name })
            .from(tableSessions)
            .innerJoin(dineTables, eq(tableSessions.tableId, dineTables.id))
            .where(inArray(tableSessions.id, sessionIds))
        : Promise.resolve([]),
    () =>
      customerIds.length
        ? db.select().from(customers).where(inArray(customers.id, customerIds))
        : Promise.resolve([]),
    () =>
      addressIds.length
        ? db.select().from(addresses).where(inArray(addresses.id, addressIds))
        : Promise.resolve([]),
  );
  const visiblePays = pays.filter((p) => !p.voidedAt);
  const names = await userNameMap(db, [
    ...rows.flatMap((r) => [r.driverId, r.createdBy]),
    ...visiblePays.flatMap((p) => [p.createdBy, p.verifiedBy]),
  ]);

  return rows.map((r) => {
    const s = sess.find((x) => x.id === r.tableSessionId);
    const c = custs.find((x) => x.id === r.customerId);
    const a = addrs.find((x) => x.id === r.addressId);
    const myPays = visiblePays.filter((p) => p.orderId === r.id);
    const proof = [...myPays].reverse().find((p) => p.proofUrl);
    return {
      id: r.id,
      businessDate: r.businessDate,
      number: r.number,
      displayNo: r.displayNo,
      channel: r.channel,
      type: r.type,
      status: r.status,
      paymentStatus: r.paymentStatus,
      paymentMethod: r.paymentMethod ?? null,
      shiftId: r.shiftId,
      tableSessionId: r.tableSessionId,
      table: s ? { id: s.tableId, name: s.tableName } : null,
      customer: c
        ? { id: c.id, name: c.name, username: c.username, phone: c.phone, telegramId: c.telegramId }
        : null,
      customerName: r.customerName,
      address: a
        ? { id: a.id, label: a.label, text: a.text, landmark: a.landmark, lat: a.lat, lng: a.lng }
        : null,
      driver: r.driverId ? { id: r.driverId, name: names.get(r.driverId) ?? '?' } : null,
      items: items
        .filter((i) => i.orderId === r.id)
        .map((i) => ({
          id: i.id,
          itemId: i.itemId,
          name: i.nameSnapshot,
          qty: i.qty,
          unitPrice: i.unitPrice,
          options: i.optionsSnapshot ?? [],
          lineTotal: i.lineTotal,
          note: i.note,
        })),
      subtotal: r.subtotal,
      discount: r.discount,
      promoId: r.promoId,
      deliveryFee: r.deliveryFee,
      total: r.total,
      currency: r.currency,
      note: r.note,
      rejectReason: r.rejectReason,
      cancelReason: r.cancelReason,
      proofUrl: proof?.proofUrl ?? null,
      payments: myPays.map((p) => toPaymentDto(p, names)),
      paidMain: myPays.filter(paymentCounts).reduce((acc, p) => acc + netMain(p), 0),
      createdBy: r.createdBy ? { id: r.createdBy, name: names.get(r.createdBy) ?? '?' } : null,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      acceptedAt: iso(r.acceptedAt),
      cookingAt: iso(r.cookingAt),
      readyAt: iso(r.readyAt),
      pickedUpAt: iso(r.pickedUpAt),
      deliveredAt: iso(r.deliveredAt),
      servedAt: iso(r.servedAt),
      doneAt: iso(r.doneAt),
      cancelledAt: iso(r.cancelledAt),
    } satisfies OrderDto;
  });
}

export async function getOrderDto(db: DbOrTx, id: string): Promise<OrderDto> {
  const [o] = await loadOrderDtos(db, eq(orders.id, id));
  if (!o) throw notFound('Order tidak ditemukan');
  return o;
}

export function toPublicOrder(o: OrderDto): PublicOrderDto {
  return {
    id: o.id,
    number: o.number,
    displayNo: o.displayNo,
    channel: o.channel,
    type: o.type,
    status: o.status,
    paymentStatus: o.paymentStatus,
    paymentMethod: o.paymentMethod,
    table: o.table,
    address: o.address,
    items: o.items,
    subtotal: o.subtotal,
    discount: o.discount,
    deliveryFee: o.deliveryFee,
    total: o.total,
    currency: o.currency,
    note: o.note,
    rejectReason: o.rejectReason,
    proofUploaded: !!o.proofUrl,
    driverName: o.driver?.name ?? null,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
    acceptedAt: o.acceptedAt,
    cookingAt: o.cookingAt,
    readyAt: o.readyAt,
    pickedUpAt: o.pickedUpAt,
    deliveredAt: o.deliveredAt,
    servedAt: o.servedAt,
    doneAt: o.doneAt,
    cancelledAt: o.cancelledAt,
  };
}
