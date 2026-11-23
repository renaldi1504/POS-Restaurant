import type { FastifyInstance } from 'fastify';
import { Bot } from 'grammy';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { OrderMessagesResponse } from '@pos/shared';
import { customers, roles, users } from '../src/db/schema';
import { hashPin } from '../src/lib/pin';
import { setupBot } from '../src/modules/telegram/service';
import { call, cookieHeader, createTestApp, loginAs } from './helpers';
import { closeAllShifts, menuIds, openShift, resetSettings, type MenuIds } from './fixtures';

let app: FastifyInstance;
let kasir: string;
let dapur: string;
let driver: string;
let otherDriver: string;
let ids: MenuIds;
let orderId: string;
const TG = '8880001';
const botCalls: string[] = [];
let bot: Bot;

beforeAll(async () => {
  app = await createTestApp();
  await app.ready();
  await resetSettings(app);
  await closeAllShifts(app);
  kasir = await loginAs(app, 'Kasir Pagi');
  dapur = await loginAs(app, 'Dapur');
  driver = await loginAs(app, 'Driver');
  const [role] = await app.db.select().from(roles).where(eq(roles.name, 'Driver'));
  const [u] = await app.db
    .insert(users)
    .values({ name: 'Driver Chat Lain', roleId: role!.id, pinHash: await hashPin('6262'), lang: 'id' })
    .returning();
  otherDriver = cookieHeader(await call(app, 'authPin', { body: { userId: u!.id, pin: '6262' } }));
  ids = await menuIds(app);
  await openShift(app, kasir);

  const [c] = await app.db
    .insert(customers)
    .values({ telegramId: TG, name: 'Sok Dara', lang: 'kh' })
    .onConflictDoUpdate({ target: customers.telegramId, set: { lang: 'kh' } })
    .returning();
  const r = await call(app, 'orderCreate', {
    cookie: kasir,
    body: {
      type: 'delivery',
      channel: 'telegram',
      customerId: c!.id,
      items: [{ itemId: ids.item('Kopi Susu'), qty: 1 }],
      delivery: { name: 'Sok Dara', phone: '011', addressText: 'Otres', lat: 10.6, lng: 103.5 },
    },
  });
  expect(r.statusCode, r.body).toBe(200);
  orderId = r.json().order.id;
  await call(app, 'orderStatus', { cookie: dapur, params: { id: orderId }, body: { status: 'cooking' } });
  await call(app, 'orderStatus', { cookie: dapur, params: { id: orderId }, body: { status: 'ready' } });
  expect((await call(app, 'driverTake', { cookie: driver, params: { id: orderId } })).statusCode).toBe(200);

  bot = new Bot('123:TEST', {
    botInfo: { id: 123, is_bot: true, first_name: 'Bot', username: 'berkat_bot' } as never,
  });
  bot.api.config.use(async (_p, method) => {
    botCalls.push(method);
    return { ok: true, result: true } as never;
  });
  setupBot(app, bot, async () => undefined);
});
afterAll(async () => {
  await app.db.update(users).set({ active: false }).where(eq(users.name, 'Driver Chat Lain'));
  await closeAllShifts(app);
  await app.close();
});

const tgMsg = (extra: Record<string, unknown>, id: number) => ({
  update_id: id,
  message: {
    message_id: id,
    date: 0,
    chat: { id: Number(TG), type: 'private', first_name: 'Sok' },
    from: { id: Number(TG), is_bot: false, first_name: 'Sok' },
    ...extra,
  },
});

describe('chat driver ↔ pelanggan Telegram', () => {
  it('driver mengirim template → dalam bahasa pelanggan (Khmer); driver lain ditolak', async () => {
    const res = await call(app, 'orderMessageSend', {
      cookie: driver,
      params: { id: orderId },
      body: { template: 'arrived' },
    });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json().message).toMatchObject({ direction: 'out', template: 'arrived' });
    expect(res.json().message.text).toContain('ខ្ញុំបានមកដល់');
    const free = await call(app, 'orderMessageSend', {
      cookie: driver,
      params: { id: orderId },
      body: { text: 'Saya di depan gerbang' },
    });
    expect(free.statusCode).toBe(200);
    const denied = await call(app, 'orderMessages', { cookie: otherDriver, params: { id: orderId } });
    expect(denied.statusCode).toBe(403);
  });

  it('balasan pelanggan (teks & lokasi) diteruskan ke chat order, tidak dijawab AI', async () => {
    botCalls.length = 0;
    await bot.handleUpdate(tgMsg({ text: 'ok saya keluar' }, 11) as never);
    await bot.handleUpdate(tgMsg({ location: { latitude: 10.61, longitude: 103.51 } }, 12) as never);
    expect(botCalls).not.toContain('sendMessage');
    const list = OrderMessagesResponse.parse(
      (await call(app, 'orderMessages', { cookie: driver, params: { id: orderId } })).json(),
    );
    expect(list.canChat).toBe(true);
    expect(list.customerLang).toBe('kh');
    const incoming = list.messages.filter((m) => m.direction === 'in');
    expect(incoming.map((m) => m.kind)).toEqual(['text', 'location']);
    expect(incoming[0]!.text).toBe('ok saya keluar');
    expect(incoming[1]).toMatchObject({ lat: 10.61, lng: 103.51 });
    // Kasir juga bisa melihat chat
    expect((await call(app, 'orderMessages', { cookie: kasir, params: { id: orderId } })).statusCode).toBe(
      200,
    );
  });

  it('setelah diantar, pesan pelanggan kembali dijawab bot (tidak diteruskan)', async () => {
    await call(app, 'driverPicked', { cookie: driver, params: { id: orderId } });
    await call(app, 'driverDelivered', { cookie: driver, params: { id: orderId }, body: {} });
    botCalls.length = 0;
    await bot.handleUpdate(tgMsg({ text: 'ayam goreng berapa?' }, 13) as never);
    expect(botCalls).toContain('sendMessage');
  });
});
