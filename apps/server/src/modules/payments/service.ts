/** Pembayaran: cash multi-mata uang (kembalian), ABA, platform, split; bukti ABA & verifikasi. */
import { and, eq, isNull } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import {
  convertMoney,
  type CreatePaymentResponse,
  type Currency,
  type PaymentLineInput,
  type Settings,
} from '@pos/shared';
import type { DbOrTx } from '../../db/client';
import { orders, payments, tableSessions } from '../../db/schema';
import { writeAudit } from '../../lib/audit';
import { getOpenShift } from '../../lib/business';
import { now } from '../../lib/clock';
import { conflict, notFound, unprocessable, validationError } from '../../lib/errors';
import type { StaffContext } from '../../lib/session';
import { getSettings } from '../../lib/settings';
import {
  getOrderDto,
  netMain,
  paymentCounts,
  toPaymentDto,
  userNameMap,
  type PaymentRow,
} from '../orders/dto';
import { emitOrderEvent } from '../orders/events';
import { afterOrderChange, assertNotLocked, lockOrder, markOrdersPaid } from '../orders/service';
import { closeSession, emitTableUpdated, sessionBill, toSessionDto } from '../tables/service';

export interface LinePlan {
  method: PaymentLineInput['method'];
  currency: Currency;
  amount: number;
  amountMain: number;
  changeMain: number;
  proofUrl: string | null;
}

/**
 * Hitung baris pembayaran: konversi ke mata uang utama, kembalian (hanya dari cash).
 * Non-cash tidak boleh melebihi tagihan.
 */
export function planLines(
  lines: PaymentLineInput[],
  due: number,
  settings: Settings,
  partial: boolean,
): { plans: LinePlan[]; paidMain: number; changeMain: number; remainingMain: number } {
  const main = settings.currency.main;
  const plans: LinePlan[] = lines.map((l) => {
    if (!settings.currency.enabled.includes(l.currency))
      throw validationError(`Mata uang ${l.currency} tidak aktif`, [{ path: ['lines'] }]);
    return {
      method: l.method,
      currency: l.currency,
      amount: l.amount,
      amountMain: convertMoney(l.amount, l.currency, main, settings.currency.rates),
      changeMain: 0,
      proofUrl: l.proofUrl ?? null,
    };
  });
  const totalMain = plans.reduce((a, p) => a + p.amountMain, 0);
  const nonCash = plans.filter((p) => p.method !== 'cash').reduce((a, p) => a + p.amountMain, 0);
  if (nonCash > due) throw unprocessable('BAD_REQUEST', 'Pembayaran non-tunai melebihi tagihan');
  if (!partial && totalMain < due)
    throw unprocessable('PAYMENT_INSUFFICIENT', 'Uang kurang', { dueMain: due, paidMain: totalMain });
  const change = Math.max(0, totalMain - due);
  if (change > 0) {
    // Kembalian dicatat di baris cash terakhir (selalu ada karena non-cash ≤ tagihan).
    const lastCash = [...plans].reverse().find((p) => p.method === 'cash')!;
    lastCash.changeMain = change;
  }
  const received = totalMain - change;
  return { plans, paidMain: totalMain, changeMain: change, remainingMain: Math.max(0, due - received) };
}

async function insertPlans(
  tx: DbOrTx,
  plans: LinePlan[],
  target: { orderId: string | null; tableSessionId: number | null },
  shiftId: number | null,
  userId: number | null,
): Promise<PaymentRow[]> {
  const at = now();
  return tx
    .insert(payments)
    .values(
      plans.map((p) => ({
        orderId: target.orderId,
        tableSessionId: target.tableSessionId,
        shiftId,
        method: p.method,
        currency: p.currency,
        amount: p.amount,
        amountMain: p.amountMain,
        changeMain: p.changeMain,
        proofUrl: p.proofUrl,
        // Pembayaran oleh staf dianggap sudah diverifikasi.
        verifiedBy: p.proofUrl ? userId : null,
        verifiedAt: p.proofUrl ? at : null,
        createdBy: userId,
        createdAt: at,
      })),
    )
    .returning();
}

/** Total terbayar (net) sebuah order. */
export async function orderPaidMain(db: DbOrTx, orderId: string): Promise<number> {
  const rows = await db.select().from(payments).where(eq(payments.orderId, orderId));
  return rows.filter(paymentCounts).reduce((a, p) => a + netMain(p), 0);
}

/** Bayar satu order (dipakai kasir & driver saat tagih cash). */
export async function payOrder(
  app: FastifyInstance,
  orderId: string,
  lines: PaymentLineInput[],
  opts: { partial: boolean; staff: StaffContext; requireShift: boolean },
): Promise<CreatePaymentResponse> {
  const settings = await getSettings(app.db);
  const res = await app.db.transaction(async (tx) => {
    const shift = await getOpenShift(tx);
    if (opts.requireShift && !shift) throw unprocessable('SHIFT_NOT_OPEN', 'Buka shift dulu');
    const row = await lockOrder(tx, orderId);
    await assertNotLocked(tx, row, opts.staff);
    if (row.status === 'cancelled' || row.status === 'rejected')
      throw unprocessable('ORDER_LOCKED', 'Order sudah batal/ditolak');
    const paid = await orderPaidMain(tx, orderId);
    const due = Math.max(0, row.total - paid);
    if (due <= 0 || row.paymentStatus === 'paid') throw conflict('CONFLICT', 'Order sudah lunas');
    const plan = planLines(lines, due, settings, opts.partial);
    const rows = await insertPlans(
      tx,
      plan.plans,
      { orderId, tableSessionId: null },
      shift?.id ?? null,
      opts.staff.id,
    );
    if (plan.remainingMain === 0) {
      await markOrdersPaid(tx, [orderId], opts.staff.id);
      // Semua ronde meja lunas satu per satu → sesi ditutup.
      if (row.tableSessionId) {
        const bill = await sessionBill(tx, row.tableSessionId);
        const allPaid = bill.orders.every(
          (o) =>
            o.id === orderId || o.paymentStatus === 'paid' || ['rejected', 'cancelled'].includes(o.status),
        );
        if (allPaid && !bill.orders.some((o) => o.status === 'pending_accept'))
          await closeSession(tx, row.tableSessionId);
      }
    }
    await writeAudit(tx, {
      userId: opts.staff.id,
      action: 'payment.create',
      entity: 'order',
      entityId: orderId,
      after: { lines: plan.plans, remainingMain: plan.remainingMain },
    });
    return { rows, plan, prevStatus: row.status, tableSessionId: row.tableSessionId };
  });
  const order = await afterOrderChange(app, orderId, { prevStatus: res.prevStatus });
  const names = await userNameMap(
    app.db,
    res.rows.flatMap((r) => [r.createdBy, r.verifiedBy]),
  );
  return {
    payments: res.rows.map((r) => toPaymentDto(r, names)),
    paidMain: res.plan.paidMain,
    changeMain: res.plan.changeMain,
    remainingMain: res.plan.remainingMain,
    order,
    session: null,
  };
}

/** Bayar sesi meja (tagihan gabungan). Lunas → sesi ditutup, semua order lunas. */
export async function paySession(
  app: FastifyInstance,
  sessionId: number,
  lines: PaymentLineInput[],
  opts: { partial: boolean; staff: StaffContext },
): Promise<CreatePaymentResponse> {
  const settings = await getSettings(app.db);
  const res = await app.db.transaction(async (tx) => {
    const shift = await getOpenShift(tx);
    if (!shift) throw unprocessable('SHIFT_NOT_OPEN', 'Buka shift dulu');
    const [session] = await tx
      .select()
      .from(tableSessions)
      .where(eq(tableSessions.id, sessionId))
      .for('update');
    if (!session) throw notFound('Sesi meja tidak ditemukan');
    if (session.status === 'paid') throw conflict('CONFLICT', 'Tagihan meja sudah lunas');
    const bill = await sessionBill(tx, sessionId);
    if (bill.remaining <= 0) throw conflict('CONFLICT', 'Tidak ada tagihan');
    const plan = planLines(lines, bill.remaining, settings, opts.partial);
    const rows = await insertPlans(
      tx,
      plan.plans,
      { orderId: null, tableSessionId: sessionId },
      shift.id,
      opts.staff.id,
    );
    let closed = false;
    const billedIds = bill.orders
      .filter((o) => !['pending_accept', 'rejected', 'cancelled'].includes(o.status))
      .map((o) => o.id);
    if (plan.remainingMain === 0) {
      await markOrdersPaid(tx, billedIds, opts.staff.id);
      await closeSession(tx, sessionId);
      closed = true;
    }
    await writeAudit(tx, {
      userId: opts.staff.id,
      action: 'payment.create',
      entity: 'table_session',
      entityId: sessionId,
      after: { lines: plan.plans, remainingMain: plan.remainingMain, closed },
    });
    const [after] = await tx.select().from(tableSessions).where(eq(tableSessions.id, sessionId));
    return { rows, plan, session: after!, closed, orderIds: billedIds };
  });
  if (res.closed) {
    for (const id of res.orderIds) emitOrderEvent(app, 'order.updated', await getOrderDto(app.db, id));
  }
  await emitTableUpdated(app, res.session.tableId, sessionId);
  const names = await userNameMap(
    app.db,
    res.rows.flatMap((r) => [r.createdBy, r.verifiedBy]),
  );
  return {
    payments: res.rows.map((r) => toPaymentDto(r, names)),
    paidMain: res.plan.paidMain,
    changeMain: res.plan.changeMain,
    remainingMain: res.plan.remainingMain,
    order: null,
    session: toSessionDto(res.session),
  };
}

/** Verifikasi bukti ABA: setujui → hitung (lunas bila cukup); tolak → void. */
export async function verifyPayment(
  app: FastifyInstance,
  paymentId: number,
  staff: StaffContext,
  approved: boolean,
  note?: string,
) {
  const res = await app.db.transaction(async (tx) => {
    const [p] = await tx.select().from(payments).where(eq(payments.id, paymentId)).for('update');
    if (!p) throw notFound('Pembayaran tidak ditemukan');
    if (p.voidedAt) throw conflict('CONFLICT', 'Pembayaran sudah dibatalkan');
    if (p.verifiedAt) throw conflict('CONFLICT', 'Pembayaran sudah diverifikasi');
    const shift = await getOpenShift(tx);
    const at = now();
    const set = approved
      ? { verifiedBy: staff.id, verifiedAt: at, shiftId: p.shiftId ?? shift?.id ?? null }
      : { voidedAt: at, verifiedBy: staff.id };
    const [updated] = await tx.update(payments).set(set).where(eq(payments.id, paymentId)).returning();
    let prevStatus = null as null | string;
    if (p.orderId) {
      const row = await lockOrder(tx, p.orderId);
      prevStatus = row.status;
      const paid = await orderPaidMain(tx, p.orderId);
      const pending = await tx
        .select({ id: payments.id })
        .from(payments)
        .where(and(eq(payments.orderId, p.orderId), isNull(payments.voidedAt), isNull(payments.verifiedAt)));
      if (paid >= row.total) await markOrdersPaid(tx, [p.orderId], staff.id);
      else
        await tx
          .update(orders)
          .set({ paymentStatus: pending.length ? 'pending_verification' : 'unpaid', updatedAt: at })
          .where(eq(orders.id, p.orderId));
    }
    await writeAudit(tx, {
      userId: staff.id,
      action: approved ? 'payment.verify' : 'payment.reject',
      entity: 'payment',
      entityId: paymentId,
      after: { approved },
      reason: note ?? null,
    });
    return { updated: updated!, prevStatus };
  });
  const order = res.updated.orderId
    ? await afterOrderChange(app, res.updated.orderId, { notify: true })
    : null;
  const names = await userNameMap(app.db, [res.updated.createdBy, res.updated.verifiedBy]);
  return { payment: toPaymentDto(res.updated, names), order };
}

/** Bukti ABA dari pelanggan → payment pending + order pending_verification. */
export async function recordProof(
  tx: DbOrTx,
  orderId: string,
  proofUrl: string,
  settings: Settings,
): Promise<PaymentRow> {
  const row = await lockOrder(tx, orderId);
  if (['cancelled', 'rejected'].includes(row.status))
    throw unprocessable('ORDER_LOCKED', 'Order sudah batal');
  if (row.paymentStatus === 'paid') throw conflict('CONFLICT', 'Order sudah lunas');
  const at = now();
  // Bukti lama yang belum diverifikasi diganti.
  await tx
    .update(payments)
    .set({ voidedAt: at })
    .where(and(eq(payments.orderId, orderId), isNull(payments.voidedAt), isNull(payments.verifiedAt)));
  const paid = await orderPaidMain(tx, orderId);
  const amount = Math.max(0, row.total - paid);
  const shift = await getOpenShift(tx);
  const [p] = await tx
    .insert(payments)
    .values({
      orderId,
      shiftId: shift?.id ?? null,
      method: 'aba',
      currency: settings.currency.main,
      amount,
      amountMain: amount,
      changeMain: 0,
      proofUrl,
      createdAt: at,
    })
    .returning();
  await tx
    .update(orders)
    .set({ paymentStatus: 'pending_verification', paymentMethod: 'aba', updatedAt: at })
    .where(eq(orders.id, orderId));
  return p!;
}
