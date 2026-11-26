import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { customers } from '../src/db/schema';
import { patchSettings } from '../src/lib/settings';
import { handleNotifyJob, setTelegramForTest, type TelegramService } from '../src/modules/telegram/service';
import { call, createTestApp, loginAs } from './helpers';
import { closeAllShifts, menuIds, openShift, resetSettings, type MenuIds } from './fixtures';

let app: FastifyInstance;
let kasir: string;
let dapur: string;
let driver: string;
let ids: MenuIds;
let orderId: string;
const TG = '8880042';
type Sent = { kind: 'text' | 'photo'; text: string; button?: { text: string; url: string } | null };
const sent: Sent[] = [];

beforeAll(async () => {
  app = await createTestApp();
  await app.ready();
  await resetSettings(app);
  await closeAllShifts(app);
  kasir = await loginAs(app, 'Kasir Pagi');
  dapur = await loginAs(app, 'Dapur');
  driver = await loginAs(app, 'Driver');
  ids = await menuIds(app);
  await openShift(app, kasir);
  const fake: Pick<TelegramService, 'enabled' | 'sendMessage' | 'sendPhoto'> = {
    enabled: true,
    async sendMessage(_c, text, _b, button) {
      sent.push({ kind: 'text', text, button });
    },
    async sendPhoto(_c, _f, caption) {
      sent.push({ kind: 'photo', text: caption });
    },
  };
  setTelegramForTest(app, fake as TelegramService);
  const [c] = await app.db
    .insert(customers)
    .values({ telegramId: TG, name: 'Dara', lang: 'id' })
    .onConflictDoUpdate({ target: customers.telegramId, set: { lang: 'id' } })
    .returning();
  const r = await call(app, 'orderCreate', {
    cookie: kasir,
    body: {
      type: 'delivery',
      channel: 'telegram',
      customerId: c!.id,
      items: [{ itemId: ids.item('Kopi Susu'), qty: 1 }],
      delivery: { name: 'Dara', phone: '012', addressText: 'Otres 2', lat: 10.6, lng: 103.5 },
    },
  });
  expect(r.statusCode, r.body).toBe(200);
  orderId = r.json().order.id;
});
afterAll(async () => {
  await patchSettings(app.db, { telegram: { groupUrl: '' } });
  await closeAllShifts(app);
  await app.close();
});

const last = () => sent.at(-1)!;

describe('alur notifikasi Telegram pelanggan', () => {
  it('dimasak tidak dikirim; siap & diantar dikirim', async () => {
    sent.length = 0;
    await handleNotifyJob(app, { orderId, status: 'cooking' });
    expect(sent).toHaveLength(0);
    await handleNotifyJob(app, { orderId, status: 'ready' });
    expect(last().text).toContain('Siap');
    await handleNotifyJob(app, { orderId, status: 'picked_up' });
    expect(last().text).toContain('Diantar');
  });

  it('order diedit kasir → rincian terbaru', async () => {
    const r = await call(app, 'orderUpdate', {
      cookie: kasir,
      params: { id: orderId },
      body: { items: [{ itemId: ids.item('Kopi Susu'), qty: 3 }] },
    });
    expect(r.statusCode, r.body).toBe(200);
    expect(app.jobs.disabledLog.at(-1)).toMatchObject({ data: { orderId, kind: 'edited' } });
    await handleNotifyJob(app, { orderId, status: 'accepted', kind: 'edited' });
    expect(last().text).toContain('Pesanan Anda diperbarui');
    expect(last().text).toContain('3× Kopi Susu');
  });

  it('sampai dengan foto driver → dikirim sebagai foto berstatus Sampai', async () => {
    await call(app, 'orderStatus', { cookie: dapur, params: { id: orderId }, body: { status: 'cooking' } });
    await call(app, 'orderStatus', { cookie: dapur, params: { id: orderId }, body: { status: 'ready' } });
    await call(app, 'driverTake', { cookie: driver, params: { id: orderId } });
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
      'base64',
    );
    const boundary = '----x';
    const payload = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="a.png"\r\nContent-Type: image/png\r\n\r\n`,
      ),
      png,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    const up = await app.inject({
      method: 'POST',
      url: `/api/driver/orders/${orderId}/delivery-photo`,
      headers: { cookie: driver, 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload,
    });
    expect(up.statusCode, up.body).toBe(200);
    sent.length = 0;
    await handleNotifyJob(app, { orderId, status: 'delivered' });
    expect(sent).toEqual([{ kind: 'photo', text: expect.stringContaining('Sampai') }]);
  });

  it('selesai → terima kasih + tombol gabung grup dari Pengaturan', async () => {
    await handleNotifyJob(app, { orderId, status: 'done' });
    expect(last().text).toContain('semoga makanannya enak');
    expect(last().button).toBeNull();
    await patchSettings(app.db, { telegram: { groupUrl: 'https://t.me/tuktuklovers' } });
    await handleNotifyJob(app, { orderId, status: 'done' });
    expect(last().button).toEqual({ text: '👥 Gabung grup Telegram kami', url: 'https://t.me/tuktuklovers' });
  });
});
