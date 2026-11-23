/**
 * Chat driver/staf ↔ pelanggan Telegram per order. Pesan staf dikirim lewat bot (atau akun
 * Telegram Business bila pelanggan chat ke sana); balasan pelanggan (teks, foto, lokasi) selama
 * order delivery-nya sedang diantar diteruskan ke aplikasi driver secara realtime.
 */
import { and, asc, desc, eq, gt, inArray, isNotNull } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { hasPermission, LANGS, type ChatTemplate, type Lang, type OrderMessageDto } from '@pos/shared';
import { customers, orderMessages, orders } from '../../db/schema';
import { now } from '../../lib/clock';
import { forbidden, unprocessable } from '../../lib/errors';
import type { StaffContext } from '../../lib/session';
import { getOrderDto, userNameMap } from '../orders/dto';
import { getTelegram } from '../telegram/service';

/** Template cepat — dikirim dalam bahasa pelanggan. */
export const CHAT_TEMPLATE_TEXT: Record<Lang, Record<ChatTemplate, string>> = {
  id: {
    on_the_way: 'Pesanan Anda sedang dalam perjalanan 🛵',
    arrived: 'Saya sudah sampai di lokasi Anda 📍 Mohon keluar sebentar ya.',
    send_location: 'Mohon kirim lokasi Anda: tekan 📎 → Lokasi.',
    wait: 'Mohon tunggu sebentar ya 🙏',
    thanks: 'Terima kasih, selamat menikmati! 😊',
  },
  en: {
    on_the_way: 'Your order is on the way 🛵',
    arrived: "I've arrived at your location 📍 Please come out.",
    send_location: 'Please send your location: tap 📎 → Location.',
    wait: 'Please wait a moment 🙏',
    thanks: 'Thank you, enjoy your meal! 😊',
  },
  kh: {
    on_the_way: 'ការកុម្ម៉ង់របស់អ្នកកំពុងដឹកមក 🛵',
    arrived: 'ខ្ញុំបានមកដល់ទីតាំងរបស់អ្នកហើយ 📍 សូមចេញមកបន្តិច។',
    send_location: 'សូមផ្ញើទីតាំងរបស់អ្នក៖ ចុច 📎 → ទីតាំង។',
    wait: 'សូមរង់ចាំបន្តិច 🙏',
    thanks: 'អរគុណ សូមរីករាយជាមួយអាហារ! 😊',
  },
  zh: {
    on_the_way: '您的订单正在配送中 🛵',
    arrived: '我已到达您的位置 📍 请出来取餐。',
    send_location: '请发送您的位置：点 📎 → 位置。',
    wait: '请稍等一下 🙏',
    thanks: '谢谢，祝您用餐愉快！😊',
  },
};

const PREFIX: Record<Lang, string> = { id: 'Driver', en: 'Driver', kh: 'អ្នកដឹក', zh: '骑手' };

/** Status order yang chat-nya diteruskan ke driver. */
const CHAT_STATUSES = ['accepted', 'cooking', 'ready', 'picked_up'] as const;

type Row = typeof orderMessages.$inferSelect;

async function toDtos(app: FastifyInstance, rows: Row[]): Promise<OrderMessageDto[]> {
  const names = await userNameMap(
    app.db,
    rows.map((r) => r.staffId),
  );
  return rows.map((r) => ({
    id: r.id,
    orderId: r.orderId,
    direction: r.direction,
    kind: r.kind,
    text: r.text,
    template: (r.template as ChatTemplate | null) ?? null,
    photoUrl: r.photoUrl,
    lat: r.lat,
    lng: r.lng,
    staff: r.staffId ? { id: r.staffId, name: names.get(r.staffId) ?? '?' } : null,
    createdAt: r.createdAt.toISOString(),
  }));
}

function emit(app: FastifyInstance, message: OrderMessageDto) {
  app.realtime.emitStaff(['driver', 'cashier'], 'order.message', { message, at: now().toISOString() });
}

/** Order + pelanggan Telegram-nya; driver hanya boleh chat order yang dia antar. */
export async function chatTarget(app: FastifyInstance, orderId: string, staff: StaffContext) {
  const order = await getOrderDto(app.db, orderId);
  const driverOnly =
    hasPermission(staff.permissions, 'driver.deliver') &&
    !['order.create', 'order.accept'].some((p) => staff.permissions.includes(p as never));
  if (driverOnly && order.driver?.id !== staff.id) throw forbidden('Hanya driver order ini yang bisa chat');
  const [c] = order.customer
    ? await app.db.select().from(customers).where(eq(customers.id, order.customer.id))
    : [];
  const lang: Lang = c && (LANGS as readonly string[]).includes(c.lang) ? (c.lang as Lang) : 'id';
  return { order, customer: c?.telegramId ? c : null, lang };
}

export async function listMessages(app: FastifyInstance, orderId: string, staff: StaffContext) {
  const { customer, lang } = await chatTarget(app, orderId, staff);
  const rows = await app.db
    .select()
    .from(orderMessages)
    .where(eq(orderMessages.orderId, orderId))
    .orderBy(asc(orderMessages.createdAt), asc(orderMessages.id));
  return { messages: await toDtos(app, rows), canChat: !!customer, customerLang: lang };
}

function requireTelegram(customer: { telegramId: string | null } | null) {
  if (!customer?.telegramId)
    throw unprocessable('VALIDATION_ERROR', 'Pelanggan ini tidak memakai Telegram — hubungi lewat telepon');
  return customer.telegramId;
}

export async function sendText(
  app: FastifyInstance,
  staff: StaffContext,
  orderId: string,
  body: { text?: string; template?: ChatTemplate },
): Promise<OrderMessageDto> {
  const { order, customer, lang } = await chatTarget(app, orderId, staff);
  const chatId = requireTelegram(customer);
  const text = body.template ? CHAT_TEMPLATE_TEXT[lang][body.template] : body.text!.trim();
  await getTelegram(app).sendMessage(
    chatId,
    `🛵 ${PREFIX[lang]} ${staff.name} · ${order.displayNo}\n${text}`,
    customer!.tgBusinessConnectionId,
  );
  const [row] = await app.db
    .insert(orderMessages)
    .values({
      orderId,
      direction: 'out',
      kind: 'text',
      text,
      template: body.template ?? null,
      staffId: staff.id,
    })
    .returning();
  const [dto] = await toDtos(app, [row!]);
  emit(app, dto!);
  return dto!;
}

export async function sendPhoto(
  app: FastifyInstance,
  staff: StaffContext,
  orderId: string,
  file: { data: Buffer; mimetype: string },
): Promise<OrderMessageDto> {
  const { order, customer, lang } = await chatTarget(app, orderId, staff);
  const chatId = requireTelegram(customer);
  await getTelegram(app).sendPhoto(
    chatId,
    file.data,
    `🛵 ${PREFIX[lang]} ${staff.name} · ${order.displayNo}`,
    customer!.tgBusinessConnectionId,
  );
  const saved = await app.storage.save({ ...file, visibility: 'private', folder: 'chat' });
  const [row] = await app.db
    .insert(orderMessages)
    .values({ orderId, direction: 'out', kind: 'photo', photoUrl: saved.url, staffId: staff.id })
    .returning();
  const [dto] = await toDtos(app, [row!]);
  emit(app, dto!);
  return dto!;
}

/** Order delivery pelanggan ini yang sedang ditangani driver (paling baru, 12 jam terakhir). */
export async function activeDeliveryFor(app: FastifyInstance, telegramId: string): Promise<string | null> {
  const since = new Date(now().getTime() - 12 * 3600_000);
  const [o] = await app.db
    .select({ id: orders.id })
    .from(orders)
    .innerJoin(customers, eq(customers.id, orders.customerId))
    .where(
      and(
        eq(customers.telegramId, telegramId),
        eq(orders.type, 'delivery'),
        isNotNull(orders.driverId),
        inArray(orders.status, [...CHAT_STATUSES]),
        gt(orders.createdAt, since),
      ),
    )
    .orderBy(desc(orders.createdAt))
    .limit(1);
  return o?.id ?? null;
}

/** Simpan pesan masuk dari pelanggan & teruskan ke driver/kasir. */
export async function recordIncoming(
  app: FastifyInstance,
  orderId: string,
  msg: {
    kind: 'text' | 'photo' | 'location';
    text?: string | null;
    photoUrl?: string | null;
    lat?: number;
    lng?: number;
  },
): Promise<OrderMessageDto> {
  const [row] = await app.db
    .insert(orderMessages)
    .values({
      orderId,
      direction: 'in',
      kind: msg.kind,
      text: msg.text ?? null,
      photoUrl: msg.photoUrl ?? null,
      lat: msg.lat ?? null,
      lng: msg.lng ?? null,
    })
    .returning();
  const [dto] = await toDtos(app, [row!]);
  emit(app, dto!);
  return dto!;
}
