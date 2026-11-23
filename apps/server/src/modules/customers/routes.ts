import { and, desc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { isOpenAt, nextOpenTime, openPeriods, type PaymentProofPayload } from '@pos/shared';
import { addresses, customers, dineTables, orders, tableSessions, users } from '../../db/schema';
import { writeAudit } from '../../lib/audit';
import { currentBusinessDate } from '../../lib/business';
import { now } from '../../lib/clock';
import { AppError, forbidden, notFound, unprocessable, validationError } from '../../lib/errors';
import { JOB_NAMES } from '../../lib/jobs';
import { defineRoute } from '../../lib/route';
import { destroyCustomerSession, upsertCustomerSession } from '../../lib/session';
import { getSettings } from '../../lib/settings';
import { readImageUpload } from '../../lib/upload';
import { getOrderDto, loadOrderDtos, toPublicOrder } from '../orders/dto';
import { afterOrderChange, createOrder } from '../orders/service';
import { recordProof } from '../payments/service';
import { langFromTelegram, validateInitData } from '../telegram/initData';
import { verifyOrderLinkToken } from '../telegram/orderLink';
import { emitTableUpdated, getOpenSession, sessionBill, toSessionDto } from '../tables/service';
import { assertOrderAccess, ensureCustomer, myOrdersWhere, sessionResponse } from './service';

export default async function customersRoutes(app: FastifyInstance) {
  // ---------- Sesi ----------
  defineRoute(app, 'publicSessionTelegram', async ({ body, req, reply }) => {
    const token = app.config.TELEGRAM_BOT_TOKEN ?? null;
    if (!token && app.config.isProd)
      throw unprocessable('INTEGRATION_DISABLED', 'Bot Telegram belum dikonfigurasi');
    // Tanpa token (dev): initData tidak diverifikasi HMAC, hanya umur & bentuk.
    const r = validateInitData(body.initData, token, { nowSec: Math.floor(now().getTime() / 1000) });
    if (!r.ok) {
      const msg =
        r.reason === 'expired'
          ? 'Sesi Telegram kedaluwarsa, buka ulang Mini App'
          : 'Data Telegram tidak valid';
      throw new AppError(401, 'TELEGRAM_AUTH_FAILED', msg, { reason: r.reason });
    }
    const u = r.user;
    const name = [u.first_name, u.last_name].filter(Boolean).join(' ').trim() || u.username || null;
    const lang = langFromTelegram(u.language_code);
    const [existing] = await app.db
      .select()
      .from(customers)
      .where(eq(customers.telegramId, String(u.id)));
    let customerId: number;
    if (existing) {
      await app.db
        .update(customers)
        .set({ name: name ?? existing.name, username: u.username ?? existing.username })
        .where(eq(customers.id, existing.id));
      customerId = existing.id;
    } else {
      const [c] = await app.db
        .insert(customers)
        .values({ telegramId: String(u.id), name, username: u.username ?? null, lang: lang ?? 'id' })
        .onConflictDoUpdate({ target: customers.telegramId, set: { name, username: u.username ?? null } })
        .returning();
      customerId = c!.id;
    }
    const ctx = await upsertCustomerSession(app, req, reply, { customerId, tableId: null });
    return sessionResponse(app.db, ctx);
  });

  defineRoute(app, 'publicSessionTelegramLink', async ({ body, req, reply }) => {
    const r = verifyOrderLinkToken(app.config.SESSION_SECRET, body.token, Math.floor(now().getTime() / 1000));
    if (!r.ok)
      throw new AppError(
        401,
        'TELEGRAM_AUTH_FAILED',
        r.reason === 'expired'
          ? 'Sesi Telegram kedaluwarsa, buka ulang Mini App'
          : 'Data Telegram tidak valid',
        { reason: r.reason },
      );
    const [c] = await app.db
      .insert(customers)
      .values({ telegramId: r.telegramId })
      .onConflictDoUpdate({ target: customers.telegramId, set: { telegramId: r.telegramId } })
      .returning({ id: customers.id });
    const ctx = await upsertCustomerSession(app, req, reply, { customerId: c!.id, tableId: null });
    return sessionResponse(app.db, ctx);
  });

  defineRoute(app, 'publicSessionTable', async ({ body, req, reply }) => {
    const [t] = await app.db.select().from(dineTables).where(eq(dineTables.qrToken, body.qrToken));
    if (!t || !t.active) throw notFound('QR meja tidak berlaku, minta bantuan kasir');
    const ctx = await upsertCustomerSession(app, req, reply, { tableId: t.id });
    return sessionResponse(app.db, ctx);
  });

  defineRoute(app, 'publicSession', async ({ customer }) => sessionResponse(app.db, customer));

  defineRoute(app, 'publicSessionUpdate', async ({ body, req, reply }) => {
    const c = await ensureCustomer(app, req, reply);
    const set: Partial<typeof customers.$inferInsert> = {};
    if (body.name !== undefined) set.name = body.name;
    if (body.phone !== undefined) set.phone = body.phone;
    if (body.lang !== undefined) set.lang = body.lang;
    if (Object.keys(set).length) await app.db.update(customers).set(set).where(eq(customers.id, c.id));
    return sessionResponse(app.db, req.customer);
  });

  defineRoute(app, 'publicSessionEnd', async ({ req, reply }) => {
    await destroyCustomerSession(app, req, reply);
    return { ok: true as const };
  });

  defineRoute(app, 'publicSettings', async () => {
    const s = await getSettings(app.db);
    const at = now();
    return {
      name: s.profile.name,
      logoUrl: s.profile.logoUrl,
      address: s.profile.address,
      phone: s.profile.phone,
      lat: s.profile.lat,
      lng: s.profile.lng,
      hours: {
        open: s.hours.open,
        close: s.hours.close,
        periods: openPeriods(s.hours),
        nextOpen: nextOpenTime(at, s.hours),
      },
      isOpen: isOpenAt(at, s.hours),
      businessDate: currentBusinessDate(s, at),
      currency: s.currency,
      delivery: { minOrder: s.delivery.minOrder, defaultFee: s.delivery.defaultFee },
      qrRequireAccept: s.qr.requireAccept,
      telegramBotUsername: app.config.TELEGRAM_BOT_USERNAME ?? null,
      aba: s.payment.aba.accountNumber.trim()
        ? {
            accountName: s.payment.aba.accountName,
            accountNumber: s.payment.aba.accountNumber,
            qrImageUrl: s.payment.aba.qrImageUrl ?? null,
          }
        : null,
    };
  });

  // ---------- Order ----------
  defineRoute(app, 'publicOrderCreate', async ({ body, req, reply }) => {
    const settings = await getSettings(app.db);
    if (!isOpenAt(now(), settings.hours)) throw unprocessable('STORE_CLOSED', 'Restoran sedang tutup');
    const session = await sessionResponse(app.db, req.customer);
    const items = body.items;

    if (session.mode === 'table' && session.table) {
      if (body.type && body.type !== 'dine_in')
        throw validationError('Mode meja hanya untuk makan di sini', [{ path: ['type'] }]);
      const order = await createOrder(app, {
        channel: 'qr',
        type: 'dine_in',
        items,
        tableId: session.table.id,
        customerId: req.customer?.customerId ?? null,
        customerName: session.customer?.name ?? null,
        note: body.note,
        createdBy: null,
        requireShift: false,
        enforceMinOrder: false,
      });
      return { order: toPublicOrder(order) };
    }

    if (session.mode === 'telegram' && session.customer) {
      const c = session.customer;
      if (body.type && body.type !== 'delivery')
        throw validationError('Order Telegram selalu delivery', [{ path: ['type'] }]);
      if (!body.addressId) throw validationError('Pilih alamat pengantaran', [{ path: ['addressId'] }]);
      const [addr] = await app.db
        .select({ id: addresses.id })
        .from(addresses)
        .where(and(eq(addresses.id, body.addressId), eq(addresses.customerId, c.id)));
      if (!addr) throw validationError('Alamat tidak ditemukan', [{ path: ['addressId'] }]);
      if (body.lang) await app.db.update(customers).set({ lang: body.lang }).where(eq(customers.id, c.id));
      if (body.contact?.phone)
        await app.db.update(customers).set({ phone: body.contact.phone }).where(eq(customers.id, c.id));
      const [bot] = await app.db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.system, true), eq(users.active, true)))
        .limit(1);
      const order = await createOrder(app, {
        channel: 'telegram',
        type: 'delivery',
        items,
        customerId: c.id,
        customerName: c.name,
        addressId: addr.id,
        note: body.note,
        paymentMethod: body.paymentMethod ?? 'cash',
        createdBy: bot?.id ?? null,
        requireShift: false,
        enforceMinOrder: true,
      });
      return { order: toPublicOrder(order) };
    }

    // Website biasa (tamu).
    const type = body.type ?? 'delivery';
    if (type === 'dine_in') throw validationError('Makan di sini: scan QR di meja', [{ path: ['type'] }]);
    if (type === 'delivery' && !body.contact && !body.addressId)
      throw validationError('Isi nama & alamat pengantaran', [{ path: ['contact'] }]);
    const c = await ensureCustomer(app, req, reply, {
      name: body.contact?.name ?? null,
      phone: body.contact?.phone ?? null,
      lang: body.lang,
    });
    const set: Partial<typeof customers.$inferInsert> = {};
    if (body.contact?.name) set.name = body.contact.name;
    if (body.contact?.phone) set.phone = body.contact.phone;
    if (body.lang) set.lang = body.lang;
    if (Object.keys(set).length) await app.db.update(customers).set(set).where(eq(customers.id, c.id));
    let addressId: number | null = null;
    if (body.addressId) {
      const [addr] = await app.db
        .select({ id: addresses.id })
        .from(addresses)
        .where(and(eq(addresses.id, body.addressId), eq(addresses.customerId, c.id)));
      if (!addr) throw validationError('Alamat tidak ditemukan', [{ path: ['addressId'] }]);
      addressId = addr.id;
    }
    const order = await createOrder(app, {
      channel: 'website',
      type,
      items,
      customerId: c.id,
      customerName: body.contact?.name ?? c.name,
      addressId,
      delivery: type === 'delivery' && !addressId ? body.contact : undefined,
      note: body.note,
      paymentMethod: body.paymentMethod ?? 'cash',
      createdBy: null,
      requireShift: false,
      enforceMinOrder: true,
    });
    return { order: toPublicOrder(order) };
  });

  defineRoute(app, 'publicOrdersMine', async ({ customer }) => {
    const s = customer.tableId ? await getOpenSession(app.db, customer.tableId) : null;
    const where = myOrdersWhere(customer, s?.id ?? null);
    if (!where) return { orders: [] };
    const list = await loadOrderDtos(app.db, where, { orderBy: desc(orders.createdAt), limit: 20 });
    return { orders: list.map(toPublicOrder) };
  });

  defineRoute(app, 'publicOrderGet', async ({ params, customer }) => {
    await assertOrderAccess(app.db, customer, params.id);
    return { order: toPublicOrder(await getOrderDto(app.db, params.id)) };
  });

  defineRoute(app, 'publicOrderProof', async ({ params, customer, req }) => {
    await assertOrderAccess(app.db, customer, params.id);
    const file = await readImageUpload(req);
    const saved = await app.storage.save({ ...file, visibility: 'private', folder: 'proofs' });
    const settings = await getSettings(app.db);
    const payment = await app.db.transaction(async (tx) => {
      const p = await recordProof(tx, params.id, saved.url, settings);
      await writeAudit(tx, {
        userId: null,
        action: 'payment.proof',
        entity: 'order',
        entityId: params.id,
        after: { paymentId: p.id, proofUrl: saved.url },
      });
      return p;
    });
    const dto = await afterOrderChange(app, params.id, { notify: false });
    const payload: PaymentProofPayload = {
      orderId: dto.id,
      paymentId: payment.id,
      displayNo: dto.displayNo,
      at: now().toISOString(),
    };
    app.realtime.emitStaff(['cashier', 'admin'], 'payment.proof_received', payload);
    await app.jobs
      .enqueue(
        JOB_NAMES.telegramAdmin,
        { kind: 'proof', paymentId: payment.id, orderId: dto.id },
        { retryLimit: 3 },
      )
      .catch((err: unknown) => app.log.warn({ err }, 'Gagal antre kirim bukti ke admin'));
    return { order: toPublicOrder(dto) };
  });

  // ---------- Meja ----------
  defineRoute(app, 'publicTableBill', async ({ customer }) => {
    if (!customer.tableId) throw forbidden('Bukan mode meja');
    const [t] = await app.db.select().from(dineTables).where(eq(dineTables.id, customer.tableId));
    if (!t) throw notFound('Meja tidak ditemukan');
    const settings = await getSettings(app.db);
    const s = await getOpenSession(app.db, t.id);
    const table = { id: t.id, name: t.name, area: t.area };
    if (!s)
      return {
        table,
        session: null,
        orders: [],
        total: 0,
        paid: 0,
        remaining: 0,
        currency: settings.currency.main,
      };
    const bill = await sessionBill(app.db, s.id);
    return {
      table,
      session: toSessionDto(s),
      orders: bill.orders.map(toPublicOrder),
      total: bill.total,
      paid: bill.paid,
      remaining: bill.remaining,
      currency: settings.currency.main,
    };
  });

  defineRoute(app, 'publicTableBillRequest', async ({ customer }) => {
    if (!customer.tableId) throw forbidden('Bukan mode meja');
    const s = await getOpenSession(app.db, customer.tableId);
    if (!s) throw unprocessable('BAD_REQUEST', 'Belum ada pesanan di meja ini');
    const [row] = await app.db
      .update(tableSessions)
      .set({ status: 'bill_requested', billRequestedAt: now() })
      .where(eq(tableSessions.id, s.id))
      .returning();
    await writeAudit(app.db, {
      userId: null,
      action: 'table.bill_request',
      entity: 'table_session',
      entityId: s.id,
    });
    await emitTableUpdated(app, customer.tableId);
    return { session: toSessionDto(row!) };
  });

  // ---------- Alamat ----------
  const toAddressDto = (a: typeof addresses.$inferSelect) => ({
    id: a.id,
    label: a.label,
    text: a.text,
    landmark: a.landmark,
    lat: a.lat,
    lng: a.lng,
  });

  defineRoute(app, 'publicAddressesList', async ({ customer }) => {
    if (!customer.customerId) return { addresses: [] };
    const rows = await app.db
      .select()
      .from(addresses)
      .where(eq(addresses.customerId, customer.customerId))
      .orderBy(desc(addresses.createdAt));
    return { addresses: rows.map(toAddressDto) };
  });

  defineRoute(app, 'publicAddressCreate', async ({ body, req, reply }) => {
    const c = await ensureCustomer(app, req, reply);
    const [row] = await app.db
      .insert(addresses)
      .values({
        customerId: c.id,
        label: body.label,
        text: body.text,
        landmark: body.landmark ?? null,
        lat: body.lat,
        lng: body.lng,
      })
      .returning();
    return { address: toAddressDto(row!) };
  });

  const ownedAddress = async (customerId: number | null, id: number) => {
    if (!customerId) throw notFound('Alamat tidak ditemukan');
    const [a] = await app.db
      .select()
      .from(addresses)
      .where(and(eq(addresses.id, id), eq(addresses.customerId, customerId)));
    if (!a) throw notFound('Alamat tidak ditemukan');
    return a;
  };

  defineRoute(app, 'publicAddressUpdate', async ({ params, body, customer }) => {
    await ownedAddress(customer.customerId, params.id);
    const set: Partial<typeof addresses.$inferInsert> = {};
    if (body.label !== undefined) set.label = body.label;
    if (body.text !== undefined) set.text = body.text;
    if (body.landmark !== undefined) set.landmark = body.landmark;
    if (body.lat !== undefined) set.lat = body.lat;
    if (body.lng !== undefined) set.lng = body.lng;
    const [row] = Object.keys(set).length
      ? await app.db.update(addresses).set(set).where(eq(addresses.id, params.id)).returning()
      : await app.db.select().from(addresses).where(eq(addresses.id, params.id));
    return { address: toAddressDto(row!) };
  });

  defineRoute(app, 'publicAddressDelete', async ({ params, customer }) => {
    await ownedAddress(customer.customerId, params.id);
    // Dilepas dari pelanggan (riwayat order tetap menunjuk alamat ini).
    await app.db.update(addresses).set({ customerId: null }).where(eq(addresses.id, params.id));
    return { ok: true as const };
  });
}
