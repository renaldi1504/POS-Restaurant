/** Meja & sesi meja (open bill), status denah, tagihan, pindah/gabung. */
import { and, asc, eq, inArray, notInArray, or } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type {
  AdminTableDto,
  Currency,
  OrderDto,
  TableDto,
  TableSessionDto,
  TableStatus,
  TableStatusDto,
} from '@pos/shared';
import type { DbOrTx } from '../../db/client';
import { dineTables, orders, payments, tableSessions } from '../../db/schema';
import { now } from '../../lib/clock';
import { conflict, notFound, unprocessable } from '../../lib/errors';
import { getSettings } from '../../lib/settings';
import { loadOrderDtos, netMain, paymentCounts } from '../orders/dto';

export type TableRow = typeof dineTables.$inferSelect;
export type SessionRow = typeof tableSessions.$inferSelect;

const OPEN_STATUSES = ['open', 'bill_requested'] as const;
/** Order yang tidak dihitung di tagihan meja. */
const NOT_BILLED = ['pending_accept', 'rejected', 'cancelled'] as const;

export const toTableDto = (t: TableRow): TableDto => ({
  id: t.id,
  name: t.name,
  area: t.area,
  seats: t.seats,
  active: t.active,
});

export const toSessionDto = (s: SessionRow): TableSessionDto => ({
  id: s.id,
  tableId: s.tableId,
  status: s.status,
  openedAt: s.openedAt.toISOString(),
  closedAt: s.closedAt?.toISOString() ?? null,
});

export function toAdminTableDto(t: TableRow, orderOrigin: string): AdminTableDto {
  return { ...toTableDto(t), qrToken: t.qrToken, qrUrl: `${orderOrigin.replace(/\/$/, '')}/m/${t.qrToken}` };
}

export async function getTable(db: DbOrTx, id: number): Promise<TableRow> {
  const [t] = await db.select().from(dineTables).where(eq(dineTables.id, id));
  if (!t) throw notFound('Meja tidak ditemukan');
  return t;
}

export async function getOpenSession(db: DbOrTx, tableId: number): Promise<SessionRow | null> {
  const [s] = await db
    .select()
    .from(tableSessions)
    .where(and(eq(tableSessions.tableId, tableId), inArray(tableSessions.status, [...OPEN_STATUSES])))
    .orderBy(asc(tableSessions.id))
    .limit(1);
  return s ?? null;
}

/** Ambil sesi terbuka meja atau buka baru. Baris meja dikunci supaya dua order bersamaan tidak membuka 2 sesi. */
export async function getOrOpenSession(
  tx: DbOrTx,
  tableId: number,
  at: Date = now(),
): Promise<{ session: SessionRow; opened: boolean }> {
  const [t] = await tx.select().from(dineTables).where(eq(dineTables.id, tableId)).for('update');
  if (!t || !t.active) throw unprocessable('BAD_REQUEST', 'Meja tidak ditemukan / tidak aktif');
  const existing = await getOpenSession(tx, tableId);
  if (existing) return { session: existing, opened: false };
  const [s] = await tx.insert(tableSessions).values({ tableId, status: 'open', openedAt: at }).returning();
  return { session: s!, opened: true };
}

export interface BillSummary {
  orders: OrderDto[];
  subtotal: number;
  discount: number;
  total: number;
  paid: number;
  remaining: number;
}

/** Tagihan sesi: order (urut dibuat) + total yang ditagih (tanpa pending/tolak/batal) + terbayar. */
export async function sessionBill(db: DbOrTx, sessionId: number): Promise<BillSummary> {
  const list = await loadOrderDtos(db, eq(orders.tableSessionId, sessionId));
  const billed = list.filter((o) => !(NOT_BILLED as readonly string[]).includes(o.status));
  const orderIds = list.map((o) => o.id);
  const pays = await db
    .select()
    .from(payments)
    .where(
      orderIds.length
        ? or(eq(payments.tableSessionId, sessionId), inArray(payments.orderId, orderIds))
        : eq(payments.tableSessionId, sessionId),
    );
  // Pembayaran order yang batal sudah di-void; yang tersisa dihitung.
  const paid = pays.filter(paymentCounts).reduce((a, p) => a + netMain(p), 0);
  const subtotal = billed.reduce((a, o) => a + o.subtotal, 0);
  const discount = billed.reduce((a, o) => a + o.discount, 0);
  const total = billed.reduce((a, o) => a + o.total, 0);
  return { orders: list, subtotal, discount, total, paid, remaining: Math.max(0, total - paid) };
}

function statusOf(session: SessionRow | null, pendingQr: number): TableStatus {
  if (!session) return 'empty';
  if (pendingQr > 0) return 'qr_new';
  if (session.status === 'bill_requested') return 'bill_requested';
  return 'eating';
}

/** Denah meja kasir. */
export async function listTableStatuses(db: DbOrTx, tableIds?: number[]): Promise<TableStatusDto[]> {
  const tables = await db
    .select()
    .from(dineTables)
    .where(tableIds ? inArray(dineTables.id, tableIds) : eq(dineTables.active, true))
    .orderBy(asc(dineTables.sort), asc(dineTables.id));
  if (!tables.length) return [];
  const sessions = await db
    .select()
    .from(tableSessions)
    .where(
      and(
        inArray(
          tableSessions.tableId,
          tables.map((t) => t.id),
        ),
        inArray(tableSessions.status, [...OPEN_STATUSES]),
      ),
    );
  const sessionIds = sessions.map((s) => s.id);
  const orderRows = sessionIds.length
    ? await db
        .select({
          sessionId: orders.tableSessionId,
          status: orders.status,
          channel: orders.channel,
          total: orders.total,
        })
        .from(orders)
        .where(
          and(
            inArray(orders.tableSessionId, sessionIds),
            notInArray(orders.status, ['rejected', 'cancelled']),
          ),
        )
    : [];
  return tables.map((t) => {
    const s = sessions.find((x) => x.tableId === t.id) ?? null;
    const mine = s ? orderRows.filter((o) => o.sessionId === s.id) : [];
    const pendingQr = mine.filter((o) => o.status === 'pending_accept').length;
    return {
      ...toTableDto(t),
      status: statusOf(s, pendingQr),
      session: s ? toSessionDto(s) : null,
      runningTotal: mine.filter((o) => o.status !== 'pending_accept').reduce((a, o) => a + o.total, 0),
      pendingQrCount: pendingQr,
      orderCount: mine.length,
    };
  });
}

/** Emit `table.updated` ke kasir/admin dan room meja. */
export async function emitTableUpdated(
  app: FastifyInstance,
  tableId: number,
  extraSessionId?: number | null,
): Promise<void> {
  const [st] = await listTableStatuses(app.db, [tableId]);
  if (!st) return;
  const payload = {
    tableId,
    sessionId: st.session?.id ?? null,
    status: st.status,
    at: now().toISOString(),
  };
  app.realtime.emitStaff(['cashier', 'admin'], 'table.updated', payload);
  if (st.session) app.realtime.emitTable(st.session.id, 'table.updated', payload);
  if (extraSessionId && extraSessionId !== st.session?.id)
    app.realtime.emitTable(extraSessionId, 'table.updated', payload);
}

export async function tableBillDto(db: DbOrTx, tableId: number) {
  const table = await getTable(db, tableId);
  const settings = await getSettings(db);
  const session = await getOpenSession(db, tableId);
  const currency: Currency = settings.currency.main;
  if (!session)
    return {
      table: toTableDto(table),
      session: null,
      orders: [],
      subtotal: 0,
      discount: 0,
      total: 0,
      paid: 0,
      remaining: 0,
      currency,
    };
  const bill = await sessionBill(db, session.id);
  return { table: toTableDto(table), session: toSessionDto(session), currency, ...bill };
}

/** Tutup sesi (lunas). */
export async function closeSession(tx: DbOrTx, sessionId: number): Promise<void> {
  await tx
    .update(tableSessions)
    .set({ status: 'paid', closedAt: now() })
    .where(eq(tableSessions.id, sessionId));
}

export async function moveTable(tx: DbOrTx, fromTableId: number, toTableId: number): Promise<SessionRow> {
  if (fromTableId === toTableId) throw unprocessable('BAD_REQUEST', 'Meja tujuan sama');
  const ids = [fromTableId, toTableId].sort((a, b) => a - b);
  const locked = await tx.select().from(dineTables).where(inArray(dineTables.id, ids)).for('update');
  const to = locked.find((t) => t.id === toTableId);
  if (!locked.find((t) => t.id === fromTableId) || !to) throw notFound('Meja tidak ditemukan');
  if (!to.active) throw unprocessable('BAD_REQUEST', 'Meja tujuan tidak aktif');
  const session = await getOpenSession(tx, fromTableId);
  if (!session) throw unprocessable('BAD_REQUEST', 'Meja asal tidak punya tagihan terbuka');
  if (await getOpenSession(tx, toTableId)) throw conflict('TABLE_OCCUPIED', 'Meja tujuan sedang dipakai');
  const [s] = await tx
    .update(tableSessions)
    .set({ tableId: toTableId })
    .where(eq(tableSessions.id, session.id))
    .returning();
  return s!;
}

export async function mergeTables(
  tx: DbOrTx,
  fromTableId: number,
  toTableId: number,
): Promise<{ target: SessionRow; fromSessionId: number; opened: boolean }> {
  const ids = [fromTableId, toTableId].sort((a, b) => a - b);
  const locked = await tx.select().from(dineTables).where(inArray(dineTables.id, ids)).for('update');
  if (locked.length !== 2) throw notFound('Meja tidak ditemukan');
  const from = await getOpenSession(tx, fromTableId);
  if (!from) throw unprocessable('BAD_REQUEST', 'Meja asal tidak punya tagihan terbuka');
  let target = await getOpenSession(tx, toTableId);
  let opened = false;
  if (!target) {
    const [s] = await tx
      .insert(tableSessions)
      .values({ tableId: toTableId, status: 'open', openedAt: from.openedAt })
      .returning();
    target = s!;
    opened = true;
  }
  await tx
    .update(orders)
    .set({ tableSessionId: target.id, updatedAt: now() })
    .where(eq(orders.tableSessionId, from.id));
  await tx.update(payments).set({ tableSessionId: target.id }).where(eq(payments.tableSessionId, from.id));
  await tx
    .update(tableSessions)
    .set({ status: 'paid', closedAt: now(), mergedIntoId: target.id })
    .where(eq(tableSessions.id, from.id));
  return { target, fromSessionId: from.id, opened };
}
