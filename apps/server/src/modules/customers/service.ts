import { eq, or } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { CustomerDto, CustomerSessionResponse, Lang } from '@pos/shared';
import type { DbOrTx } from '../../db/client';
import { customers, dineTables, orders } from '../../db/schema';
import { forbidden, notFound } from '../../lib/errors';
import { upsertCustomerSession, type CustomerContext } from '../../lib/session';
import { getOpenSession, toSessionDto } from '../tables/service';

export type CustomerRow = typeof customers.$inferSelect;

export const toCustomerDto = (c: CustomerRow): CustomerDto => ({
  id: c.id,
  name: c.name,
  username: c.username,
  phone: c.phone,
  lang: (c.lang as Lang) ?? 'id',
  telegramId: c.telegramId,
});

export async function getCustomer(db: DbOrTx, id: number): Promise<CustomerRow | null> {
  const [c] = await db.select().from(customers).where(eq(customers.id, id));
  return c ?? null;
}

/** Mode: meja (ada tableId) > telegram (customer punya telegram_id) > none. */
export async function sessionResponse(
  db: DbOrTx,
  ctx: CustomerContext | null,
): Promise<CustomerSessionResponse> {
  if (!ctx) return { mode: 'none', customer: null, table: null, tableSession: null };
  const customer = ctx.customerId ? await getCustomer(db, ctx.customerId) : null;
  let table = null;
  let tableSession = null;
  if (ctx.tableId) {
    const [t] = await db.select().from(dineTables).where(eq(dineTables.id, ctx.tableId));
    if (t && t.active) {
      table = { id: t.id, name: t.name, area: t.area };
      const s = await getOpenSession(db, t.id);
      tableSession = s ? toSessionDto(s) : null;
    }
  }
  const mode = table ? 'table' : customer?.telegramId ? 'telegram' : 'none';
  return { mode, customer: customer ? toCustomerDto(customer) : null, table, tableSession };
}

/** Pastikan sesi pelanggan punya customer (buat tamu bila belum). */
export async function ensureCustomer(
  app: FastifyInstance,
  req: FastifyRequest,
  reply: FastifyReply,
  init: { name?: string | null; phone?: string | null; lang?: Lang } = {},
): Promise<CustomerRow> {
  const ctx = req.customer;
  if (ctx?.customerId) {
    const c = await getCustomer(app.db, ctx.customerId);
    if (c) return c;
  }
  const [c] = await app.db
    .insert(customers)
    .values({ name: init.name ?? null, phone: init.phone ?? null, lang: init.lang ?? 'id' })
    .returning();
  await upsertCustomerSession(app, req, reply, { customerId: c!.id });
  return c!;
}

/** Order yang boleh dilihat sesi ini: milik customer, atau ada di sesi meja (meja yang sama). */
export async function assertOrderAccess(db: DbOrTx, ctx: CustomerContext, orderId: string) {
  const [o] = await db
    .select({ id: orders.id, customerId: orders.customerId, tableSessionId: orders.tableSessionId })
    .from(orders)
    .where(eq(orders.id, orderId));
  if (!o) throw notFound('Order tidak ditemukan');
  if (ctx.customerId && o.customerId === ctx.customerId) return;
  if (ctx.tableId && o.tableSessionId) {
    const s = await getOpenSession(db, ctx.tableId);
    if (s && s.id === o.tableSessionId) return;
  }
  throw forbidden('Order ini bukan milik Anda');
}

export function myOrdersWhere(ctx: CustomerContext, tableSessionId: number | null) {
  const conds = [];
  if (ctx.customerId) conds.push(eq(orders.customerId, ctx.customerId));
  if (tableSessionId) conds.push(eq(orders.tableSessionId, tableSessionId));
  return conds.length ? or(...conds) : undefined;
}
