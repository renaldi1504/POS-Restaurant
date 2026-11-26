/**
 * Order: pembuatan (staf & publik), transisi status (SATU pintu: transitionOrder), batal, edit.
 */
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import {
  canTransition,
  hasPermission,
  initialStatusFor,
  type DeliveryInfoInput,
  type ManualDiscount,
  type OrderChannel,
  type OrderDto,
  type OrderStatus,
  type OrderType,
  type PaymentMethod,
  type Settings,
} from '@pos/shared';
import type { DbOrTx, Tx } from '../../db/client';
import { customers, orderItems, orders, payments, roles, shifts, users } from '../../db/schema';
import { writeAudit } from '../../lib/audit';
import { currentBusinessDate, getOpenShift } from '../../lib/business';
import { now } from '../../lib/clock';
import { AppError, notFound, unprocessable, validationError } from '../../lib/errors';
import { verifyPin } from '../../lib/pin';
import type { StaffContext } from '../../lib/session';
import { getSettings } from '../../lib/settings';
import { requireCustomer, requireCustomerAddress, saveCustomerAddress } from '../customers/staffService';
import { emitTableUpdated, getOrOpenSession } from '../tables/service';
import { getOrderDto, paymentCounts, type OrderRow } from './dto';
import { emitOrderEvent, emitReadyForPickup, notifyTelegram, notifyTelegramEdited } from './events';
import { computeDiscount, priceItems, type ItemInput, type PricedLine } from './pricing';

// ---------- Penomoran ----------
/** Nomor order berikutnya per business_date (atomic upsert … RETURNING, dalam transaksi). */
export async function nextOrderNumber(tx: DbOrTx, businessDate: string): Promise<number> {
  const res = await tx.execute<{ last_no: number }>(sql`
    INSERT INTO daily_counters (business_date, last_no) VALUES (${businessDate}, 1)
    ON CONFLICT (business_date) DO UPDATE SET last_no = daily_counters.last_no + 1
    RETURNING last_no`);
  return Number(res.rows[0]!.last_no);
}

// ---------- Pembuatan ----------
export interface NewOrderArgs {
  channel: OrderChannel;
  type: OrderType;
  items: ItemInput[];
  tableId?: number | undefined;
  customerId?: number | null | undefined;
  customerName?: string | null | undefined;
  /** No. HP yang diketik kasir (bungkus) — disimpan ke data pelanggan. */
  customerPhone?: string | undefined;
  addressId?: number | null | undefined;
  delivery?: DeliveryInfoInput | undefined;
  deliveryFee?: number | undefined;
  promoId?: number | undefined;
  discount?: ManualDiscount | undefined;
  note?: string | undefined;
  paymentMethod?: PaymentMethod | null | undefined;
  displayNo?: string | undefined;
  createdBy: number | null;
  /** Dibuat staf (POST /orders): selalu langsung `accepted`, termasuk channel telegram. */
  staffCreated?: boolean;
  /** Order staf wajib shift terbuka. */
  requireShift: boolean;
  /** Cek minimal order delivery (order pelanggan). */
  enforceMinOrder: boolean;
}

function totals(lines: PricedLine[], discount: number, deliveryFee: number) {
  const subtotal = lines.reduce((a, l) => a + l.lineTotal, 0);
  return { subtotal, total: subtotal - discount + deliveryFee };
}

async function insertDeliveryAddress(tx: Tx, customerId: number | null, d: DeliveryInfoInput) {
  // Alamat ketik kasir disimpan ke alamat pelanggan (tanpa duplikat) → muncul lagi di order berikutnya.
  const a = await saveCustomerAddress(tx, customerId, {
    text: d.addressText,
    landmark: d.landmark ?? null,
    lat: d.lat ?? null,
    lng: d.lng ?? null,
  });
  return a.id;
}

/** Pelanggan dari no HP yang diketik kasir: pakai pelanggan lama dengan no HP sama, atau buat baru. */
async function customerByPhone(tx: Tx, name: string | null, phone: string): Promise<number> {
  const [hit] = await tx
    .select({ id: customers.id, name: customers.name })
    .from(customers)
    .where(eq(customers.phone, phone))
    .orderBy(desc(customers.id))
    .limit(1);
  if (hit) {
    if (!hit.name && name) await tx.update(customers).set({ name }).where(eq(customers.id, hit.id));
    return hit.id;
  }
  const [c] = await tx.insert(customers).values({ name, phone }).returning({ id: customers.id });
  return c!.id;
}

export async function createOrder(app: FastifyInstance, args: NewOrderArgs): Promise<OrderDto> {
  const settings = await getSettings(app.db);
  const at = now();
  const res = await app.db.transaction(async (tx) => {
    const shift = await getOpenShift(tx);
    if (args.requireShift && !shift)
      throw unprocessable('SHIFT_NOT_OPEN', 'Buka shift dulu sebelum membuat order');
    const lines = await priceItems(tx, args.channel, args.items);
    const { discount, promoId } = await computeDiscount(tx, {
      lines,
      channel: args.channel,
      promoId: args.promoId,
      manual: args.discount,
      at,
    });
    const deliveryFee = args.type === 'delivery' ? (args.deliveryFee ?? settings.delivery.defaultFee) : 0;
    const { subtotal, total } = totals(lines, discount, deliveryFee);
    if (
      args.enforceMinOrder &&
      args.type === 'delivery' &&
      settings.delivery.minOrder > 0 &&
      subtotal < settings.delivery.minOrder
    ) {
      throw unprocessable('MIN_ORDER', 'Belum mencapai minimal order delivery', {
        minOrder: settings.delivery.minOrder,
        subtotal,
      });
    }

    let tableSessionId: number | null = null;
    let opened = false;
    if (args.type === 'dine_in') {
      if (!args.tableId) throw validationError('Meja wajib dipilih', [{ path: ['tableId'] }]);
      const r = await getOrOpenSession(tx, args.tableId, at);
      tableSessionId = r.session.id;
      opened = r.opened;
    }

    let customerId = args.customerId ?? null;
    let addressId = args.addressId ?? null;
    let customerName = args.customerName ?? null;
    const typedDelivery = args.type === 'delivery' && args.delivery && !addressId ? args.delivery : null;
    const typedPhone = (typedDelivery ? typedDelivery.phone : args.customerPhone)?.trim() || null;
    if (!customerId && typedPhone) {
      // Nama/HP yang diketik kasir disimpan sebagai pelanggan → driver bisa menelepon, kasir bisa mencari.
      customerId = await customerByPhone(tx, typedDelivery?.name ?? customerName, typedPhone);
    }
    if (typedDelivery) {
      addressId = await insertDeliveryAddress(tx, customerId, typedDelivery);
      customerName = customerName ?? typedDelivery.name;
    }

    const businessDate = shift?.businessDate ?? currentBusinessDate(settings, at);
    const number = await nextOrderNumber(tx, businessDate);
    const status: OrderStatus = args.staffCreated
      ? 'accepted'
      : initialStatusFor(args.channel, { qrRequireAccept: settings.qr.requireAccept });
    const [row] = await tx
      .insert(orders)
      .values({
        businessDate,
        number,
        displayNo: args.displayNo?.trim() || `#${number}`,
        channel: args.channel,
        type: args.type,
        status,
        shiftId: shift?.id ?? null,
        tableSessionId,
        customerId,
        customerName,
        addressId,
        deliveryFee,
        subtotal,
        discount,
        promoId,
        total,
        currency: settings.currency.main,
        note: args.note?.trim() || null,
        paymentMethod: args.paymentMethod ?? null,
        createdBy: args.createdBy,
        createdAt: at,
        updatedAt: at,
        acceptedAt: status === 'accepted' ? at : null,
      })
      .returning({ id: orders.id });
    const orderId = row!.id;
    await tx.insert(orderItems).values(
      lines.map((l) => ({
        orderId,
        itemId: l.itemId,
        nameSnapshot: l.name,
        qty: l.qty,
        unitPrice: l.unitPrice,
        optionsSnapshot: l.options,
        lineTotal: l.lineTotal,
        note: l.note,
      })),
    );
    await writeAudit(tx, {
      userId: args.createdBy,
      action: 'order.create',
      entity: 'order',
      entityId: orderId,
      after: { channel: args.channel, type: args.type, status, total, number, businessDate },
    });
    return { orderId, tableSessionId, opened, tableId: args.tableId ?? null };
  });

  const dto = await getOrderDto(app.db, res.orderId);
  if (res.opened && res.tableId && res.tableSessionId)
    app.realtime.attachTableSession(res.tableId, res.tableSessionId);
  emitOrderEvent(app, 'order.created', dto);
  if (res.tableId) await emitTableUpdated(app, res.tableId);
  await notifyTelegram(app, dto);
  return dto;
}

// ---------- Transisi ----------
const STATUS_TS: Partial<Record<OrderStatus, keyof typeof orders.$inferInsert>> = {
  accepted: 'acceptedAt',
  cooking: 'cookingAt',
  ready: 'readyAt',
  picked_up: 'pickedUpAt',
  delivered: 'deliveredAt',
  served: 'servedAt',
  done: 'doneAt',
  cancelled: 'cancelledAt',
};

export async function lockOrder(tx: DbOrTx, orderId: string): Promise<OrderRow> {
  const [row] = await tx.select().from(orders).where(eq(orders.id, orderId)).for('update');
  if (!row) throw notFound('Order tidak ditemukan');
  return row;
}

export interface TransitionOpts {
  reason?: string | null | undefined;
  /** Kolom tambahan yang ikut di-set (mis. shiftId, driverId). */
  set?: Partial<typeof orders.$inferInsert>;
  auditAction?: string;
  auditAfter?: Record<string, unknown>;
}

/** Validasi + terapkan transisi di dalam transaksi (tanpa emit). */
export async function applyTransition(
  tx: DbOrTx,
  row: OrderRow,
  to: OrderStatus,
  userId: number | null,
  opts: TransitionOpts = {},
): Promise<void> {
  if (!canTransition(row.status, to, row.type)) {
    throw unprocessable('INVALID_TRANSITION', `Status tidak bisa diubah dari ${row.status} ke ${to}`, {
      from: row.status,
      to,
    });
  }
  const at = now();
  const set: Partial<typeof orders.$inferInsert> = { status: to, updatedAt: at, ...opts.set };
  const tsCol = STATUS_TS[to];
  if (tsCol) (set as Record<string, unknown>)[tsCol] = at;
  if (to === 'rejected') set.rejectReason = opts.reason ?? null;
  if (to === 'cancelled') set.cancelReason = opts.reason ?? null;
  if (row.status === 'picked_up' && to === 'ready') set.pickedUpAt = null;
  await tx.update(orders).set(set).where(eq(orders.id, row.id));
  await writeAudit(tx, {
    userId,
    action: opts.auditAction ?? 'order.status',
    entity: 'order',
    entityId: row.id,
    before: { status: row.status },
    after: { status: to, ...opts.auditAfter },
    reason: opts.reason ?? null,
  });
}

/**
 * Setelah commit: muat DTO, emit realtime ke room yang tepat, notifikasi Telegram.
 * `prevStatus` dipakai untuk event `order.ready_for_pickup`.
 */
export async function afterOrderChange(
  app: FastifyInstance,
  orderId: string,
  opts: { prevStatus?: OrderStatus; notify?: boolean } = {},
): Promise<OrderDto> {
  const dto = await getOrderDto(app.db, orderId);
  emitOrderEvent(app, 'order.updated', dto);
  if (dto.type === 'delivery' && dto.status === 'ready' && opts.prevStatus !== 'ready' && !dto.driver)
    emitReadyForPickup(app, dto);
  if (dto.table) await emitTableUpdated(app, dto.table.id);
  if (opts.notify ?? opts.prevStatus !== dto.status) await notifyTelegram(app, dto);
  return dto;
}

/** SATU-SATUNYA pintu perubahan status order (validasi, audit, emit, notifikasi). */
export async function transitionOrder(
  app: FastifyInstance,
  orderId: string,
  to: OrderStatus,
  userId: number | null,
  opts: TransitionOpts & { guard?: (row: OrderRow) => void | Promise<void> } = {},
): Promise<OrderDto> {
  const prev = await app.db.transaction(async (tx) => {
    const row = await lockOrder(tx, orderId);
    if (opts.guard) await opts.guard(row);
    await applyTransition(tx, row, to, userId, opts);
    return row.status;
  });
  return afterOrderChange(app, orderId, { prevStatus: prev });
}

// ---------- Kunci setelah closing ----------
/** Order milik shift yang sudah closing hanya boleh diubah admin (settings.manage). */
export async function assertNotLocked(
  db: DbOrTx,
  row: OrderRow,
  staff: StaffContext | null,
): Promise<boolean> {
  if (!row.shiftId) return false;
  const [s] = await db.select({ closedAt: shifts.closedAt }).from(shifts).where(eq(shifts.id, row.shiftId));
  if (!s?.closedAt) return false;
  if (!staff || !hasPermission(staff.permissions, 'settings.manage'))
    throw unprocessable('SHIFT_CLOSED', 'Shift order ini sudah closing; hanya admin yang bisa mengubah');
  return true;
}

// ---------- Terima / tolak ----------
export async function acceptOrder(app: FastifyInstance, orderId: string, staff: StaffContext, note?: string) {
  const shift = await getOpenShift(app.db);
  return transitionOrder(app, orderId, 'accepted', staff.id, {
    reason: note ?? null,
    auditAction: 'order.accept',
    guard: async (row) => {
      if (row.status !== 'pending_accept')
        throw unprocessable('INVALID_TRANSITION', 'Order ini tidak menunggu diterima');
      if (row.paymentMethod === 'aba' && row.paymentStatus === 'unpaid')
        throw unprocessable('PROOF_REQUIRED', 'Tunggu bukti bayar ABA dari pelanggan');
    },
    set: shift ? { shiftId: shift.id } : {},
  });
}

export async function rejectOrder(
  app: FastifyInstance,
  orderId: string,
  staff: StaffContext,
  reason: string,
) {
  return transitionOrder(app, orderId, 'rejected', staff.id, {
    reason,
    auditAction: 'order.reject',
    guard: (row) => {
      if (row.status !== 'pending_accept')
        throw unprocessable('INVALID_TRANSITION', 'Hanya order yang menunggu diterima yang bisa ditolak');
    },
  });
}

// ---------- Batal ----------
/** Cari user aktif yang punya order.cancel_paid dengan PIN ini. */
export async function findAdminByPin(db: DbOrTx, pin: string): Promise<{ id: number; name: string } | null> {
  const rows = await db
    .select({ id: users.id, name: users.name, pinHash: users.pinHash, permissions: roles.permissions })
    .from(users)
    .innerJoin(roles, eq(roles.id, users.roleId))
    .where(and(eq(users.active, true), eq(users.system, false)));
  for (const r of rows) {
    if (!(r.permissions ?? []).includes('order.cancel_paid')) continue;
    if (await verifyPin(r.pinHash, pin)) return { id: r.id, name: r.name };
  }
  return null;
}

export async function cancelOrder(
  app: FastifyInstance,
  orderId: string,
  staff: StaffContext,
  body: { reason: string; adminPin?: string | undefined },
): Promise<OrderDto> {
  const [current] = await app.db.select().from(orders).where(eq(orders.id, orderId));
  if (!current) throw notFound('Order tidak ditemukan');
  const pays = await app.db.select().from(payments).where(eq(payments.orderId, orderId));
  const counted = pays.filter(paymentCounts);
  const paid = current.paymentStatus === 'paid' || counted.length > 0;
  let approvedBy: { id: number; name: string } | null = null;
  if (paid && !hasPermission(staff.permissions, 'order.cancel_paid')) {
    if (!body.adminPin) throw new AppError(403, 'ADMIN_PIN_REQUIRED', 'Order sudah dibayar: perlu PIN admin');
    approvedBy = await findAdminByPin(app.db, body.adminPin);
    if (!approvedBy) throw new AppError(403, 'ADMIN_PIN_REQUIRED', 'PIN admin salah');
  }
  const prev = await app.db.transaction(async (tx) => {
    const row = await lockOrder(tx, orderId);
    await assertNotLocked(tx, row, staff);
    const refundedMain = counted.reduce((a, p) => a + p.amountMain - p.changeMain, 0);
    await applyTransition(tx, row, 'cancelled', staff.id, {
      reason: body.reason,
      auditAction: paid ? 'order.cancel_paid' : 'order.cancel',
      auditAfter: paid ? { approvedBy, refundedMain } : {},
      set: paid ? { paymentStatus: 'unpaid' } : {},
    });
    if (paid) {
      await tx
        .update(payments)
        .set({ voidedAt: now() })
        .where(and(eq(payments.orderId, orderId), sql`${payments.voidedAt} is null`));
    }
    return row.status;
  });
  return afterOrderChange(app, orderId, { prevStatus: prev });
}

// ---------- Edit ----------
export interface UpdateOrderArgs {
  items?: ItemInput[] | undefined;
  type?: OrderType | undefined;
  displayNo?: string | null | undefined;
  customerName?: string | null | undefined;
  customerPhone?: string | undefined;
  delivery?: DeliveryInfoInput | undefined;
  customerId?: number | undefined;
  addressId?: number | undefined;
  deliveryFee?: number | undefined;
  promoId?: number | null | undefined;
  discount?: ManualDiscount | null | undefined;
  note?: string | null | undefined;
}

export async function updateOrder(
  app: FastifyInstance,
  orderId: string,
  staff: StaffContext,
  body: UpdateOrderArgs,
): Promise<OrderDto> {
  const settings: Settings = await getSettings(app.db);
  await app.db.transaction(async (tx) => {
    const row = await lockOrder(tx, orderId);
    await assertNotLocked(tx, row, staff);
    if (['done', 'rejected', 'cancelled'].includes(row.status))
      throw unprocessable('ORDER_LOCKED', 'Order sudah selesai/batal');
    const pays = await tx.select().from(payments).where(eq(payments.orderId, orderId));
    if (row.paymentStatus !== 'unpaid' || pays.some((p) => !p.voidedAt))
      throw unprocessable('ORDER_LOCKED', 'Order sudah dibayar, tidak bisa diubah');
    const type = body.type ?? row.type;
    if (type === 'dine_in' && !row.tableSessionId)
      throw validationError('Ubah ke makan sini lewat meja', [{ path: ['type'] }]);
    if (type !== 'dine_in' && row.tableSessionId)
      throw validationError('Order meja tidak bisa diubah tipenya', [{ path: ['type'] }]);

    let lines: PricedLine[];
    if (body.items) {
      lines = await priceItems(tx, row.channel, body.items);
    } else {
      // Hitung ulang dari item yang ada (harga snapshot dipertahankan).
      const existing = await tx.select().from(orderItems).where(eq(orderItems.orderId, orderId));
      lines = existing.map((i) => ({
        itemId: i.itemId ?? 0,
        categoryId: 0,
        name: i.nameSnapshot,
        qty: i.qty,
        unitPrice: i.unitPrice,
        options: i.optionsSnapshot,
        lineTotal: i.lineTotal,
        note: i.note,
      }));
    }
    const promoId = body.promoId !== undefined ? body.promoId : row.promoId;
    // Potongan manual tidak disimpan terpisah: tanpa field discount → pertahankan selisih manual lama.
    const { discount: promoDiscount } = await computeDiscount(tx, {
      lines,
      channel: row.channel,
      promoId,
      manual: body.discount ?? undefined,
      at: now(),
    });
    let discount = promoDiscount;
    if (body.discount === undefined && promoId === row.promoId && !body.items) discount = row.discount;
    const deliveryFee =
      type === 'delivery'
        ? (body.deliveryFee ?? (row.type === 'delivery' ? row.deliveryFee : settings.delivery.defaultFee))
        : 0;
    const subtotal = lines.reduce((a, l) => a + l.lineTotal, 0);
    discount = Math.min(discount, subtotal);
    const total = subtotal - discount + deliveryFee;

    let addressId = row.addressId;
    let customerId = row.customerId;
    let customerName = body.customerName !== undefined ? body.customerName : row.customerName;
    if (body.delivery) customerName = body.customerName ?? body.delivery.name;
    if (body.customerId !== undefined && body.customerId !== customerId) {
      customerId = (await requireCustomer(tx, body.customerId)).id;
    }
    const phone = (body.delivery ? body.delivery.phone : body.customerPhone)?.trim() || null;
    if (phone) {
      if (customerId) {
        await tx.update(customers).set({ phone }).where(eq(customers.id, customerId));
      } else {
        customerId = await customerByPhone(tx, customerName ?? null, phone);
      }
    }
    if (body.addressId && customerId) {
      const a = await requireCustomerAddress(tx, customerId, body.addressId);
      addressId = a.id;
    } else if (body.delivery) addressId = await insertDeliveryAddress(tx, customerId, body.delivery);
    const set: Partial<typeof orders.$inferInsert> = {
      type,
      subtotal,
      discount,
      promoId,
      deliveryFee,
      total,
      addressId,
      customerId,
      customerName,
      updatedAt: now(),
    };
    if (body.displayNo !== undefined) set.displayNo = body.displayNo?.trim() || `#${row.number}`;
    if (body.note !== undefined) set.note = body.note?.trim() || null;
    await tx.update(orders).set(set).where(eq(orders.id, orderId));
    if (body.items) {
      await tx.delete(orderItems).where(eq(orderItems.orderId, orderId));
      await tx.insert(orderItems).values(
        lines.map((l) => ({
          orderId,
          itemId: l.itemId,
          nameSnapshot: l.name,
          qty: l.qty,
          unitPrice: l.unitPrice,
          optionsSnapshot: l.options,
          lineTotal: l.lineTotal,
          note: l.note,
        })),
      );
    }
    await writeAudit(tx, {
      userId: staff.id,
      action: 'order.update',
      entity: 'order',
      entityId: orderId,
      before: { total: row.total, type: row.type, discount: row.discount },
      after: { total, type, discount, items: body.items?.length },
    });
  });
  const dto = await afterOrderChange(app, orderId, { notify: false });
  await notifyTelegramEdited(app, dto);
  return dto;
}

/** Tandai order lunas & selesaikan yang sudah disajikan/sampai (dalam transaksi). */
export async function markOrdersPaid(tx: DbOrTx, orderIds: string[], userId: number | null): Promise<void> {
  if (!orderIds.length) return;
  const rows = await tx.select().from(orders).where(inArray(orders.id, orderIds)).for('update');
  for (const row of rows) {
    if (row.status === 'cancelled' || row.status === 'rejected') continue;
    await tx.update(orders).set({ paymentStatus: 'paid', updatedAt: now() }).where(eq(orders.id, row.id));
    if (row.status === 'served' || row.status === 'delivered') {
      await applyTransition(tx, { ...row, paymentStatus: 'paid' }, 'done', userId, { reason: 'lunas' });
    }
  }
}
