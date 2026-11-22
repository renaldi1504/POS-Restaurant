import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CustomerSessionResponse, PublicOrderResponse } from '@pos/shared';
import { buildApp } from '../src/app';
import { loadConfig } from '../src/config';
import { clock } from '../src/lib/clock';
import { patchSettings } from '../src/lib/settings';
import { signInitData, validateInitData } from '../src/modules/telegram/initData';
import { call, createTestApp, loginAs } from './helpers';
import {
  closeAllShifts,
  menuIds,
  mergeCookies,
  multipart,
  open24h,
  openShift,
  resetSettings,
  TINY_PNG,
  type MenuIds,
} from './fixtures';

const BOT_TOKEN = '123456:TEST-token-for-hmac';
let app: FastifyInstance;
let kasir: string;
let ids: MenuIds;

const tgUser = { id: 777001, first_name: 'Sokha', last_name: 'Chan', username: 'sokha', language_code: 'km' };
const initData = (over: Record<string, string> = {}, authDate = Math.floor(Date.now() / 1000)) =>
  signInitData(
    { auth_date: String(authDate), query_id: 'AAE1', user: JSON.stringify(tgUser), ...over },
    BOT_TOKEN,
  );

beforeAll(async () => {
  app = await buildApp({
    config: loadConfig({ NODE_ENV: 'test', TELEGRAM_BOT_TOKEN: BOT_TOKEN }),
    logger: false,
  });
  await app.ready();
  await resetSettings(app);
  await open24h(app);
  await closeAllShifts(app);
  kasir = await loginAs(app, 'Kasir Pagi');
  ids = await menuIds(app);
  await openShift(app, kasir);
});
afterAll(async () => {
  await resetSettings(app);
  await app.close();
});

describe('telegram initData', () => {
  it('unit: valid / tampered / expired', () => {
    const now = Math.floor(Date.now() / 1000);
    expect(validateInitData(initData(), BOT_TOKEN).ok).toBe(true);
    const tampered = initData().replace('Sokha', 'Hacker');
    expect(validateInitData(tampered, BOT_TOKEN)).toEqual({ ok: false, reason: 'bad_hash' });
    expect(validateInitData(initData(), 'other:token')).toEqual({ ok: false, reason: 'bad_hash' });
    expect(validateInitData(initData({}, now - 25 * 3600), BOT_TOKEN)).toEqual({
      ok: false,
      reason: 'expired',
    });
  });

  it('valid initData creates a telegram session and upserts the customer', async () => {
    const res = await call(app, 'publicSessionTelegram', { body: { initData: initData() } });
    expect(res.statusCode, res.body).toBe(200);
    const s = CustomerSessionResponse.parse(res.json());
    expect(s).toMatchObject({
      mode: 'telegram',
      customer: { name: 'Sokha Chan', username: 'sokha', telegramId: '777001', lang: 'kh' },
    });
    const again = await call(app, 'publicSessionTelegram', { body: { initData: initData() } });
    expect(again.json().customer.id).toBe(s.customer!.id);
  });

  it('tampered and expired initData are rejected with TELEGRAM_AUTH_FAILED', async () => {
    const bad = await call(app, 'publicSessionTelegram', {
      body: { initData: initData().replace('Sokha', 'Evil') },
    });
    expect(bad.statusCode).toBe(401);
    expect(bad.json().error.code).toBe('TELEGRAM_AUTH_FAILED');
    const old = await call(app, 'publicSessionTelegram', {
      body: { initData: initData({}, Math.floor(Date.now() / 1000) - 2 * 86400) },
    });
    expect(old.statusCode).toBe(401);
    expect(old.json().error.details.reason).toBe('expired');
  });

  it('webhook checks secret and no-ops safely', async () => {
    const res = await app.inject({ method: 'POST', url: '/tg/webhook', payload: {} });
    expect(res.statusCode).toBe(200);
  });
});

describe('telegram order with ABA proof', () => {
  let cookie: string;
  let addressId: number;
  let orderId: string;

  it('address CRUD scoped to the customer', async () => {
    const s = await call(app, 'publicSessionTelegram', { body: { initData: initData() } });
    cookie = mergeCookies(undefined, s);
    const c = await call(app, 'publicAddressCreate', {
      cookie,
      body: { label: 'Rumah', text: 'Street 7, Otres', landmark: 'dekat pantai', lat: 10.57, lng: 103.55 },
    });
    expect(c.statusCode, c.body).toBe(200);
    addressId = c.json().address.id;
    const u = await call(app, 'publicAddressUpdate', {
      cookie,
      params: { id: addressId },
      body: { label: 'Kantor' },
    });
    expect(u.json().address.label).toBe('Kantor');
    const list = await call(app, 'publicAddressesList', { cookie });
    expect(list.json().addresses).toHaveLength(1);
    // Pelanggan lain tidak bisa mengubah
    const other = await call(app, 'publicSessionTable', {
      body: { qrToken: (await app.db.query.dineTables.findFirst())!.qrToken },
    });
    const otherUpd = await call(app, 'publicAddressUpdate', {
      cookie: mergeCookies(undefined, other),
      params: { id: addressId },
      body: { label: 'X' },
    });
    expect(otherUpd.statusCode).toBe(404);
  });

  it('telegram order is always delivery with saved address; min order enforced', async () => {
    await patchSettings(app.db, { delivery: { minOrder: 20000, defaultFee: 1500 } });
    const small = await call(app, 'publicOrderCreate', {
      cookie,
      body: { items: [{ itemId: ids.item('Nasi Putih'), qty: 1 }], addressId, paymentMethod: 'aba' },
    });
    expect(small.statusCode).toBe(422);
    expect(small.json().error.code).toBe('MIN_ORDER');
    const noAddr = await call(app, 'publicOrderCreate', {
      cookie,
      body: { items: [{ itemId: ids.item('Kopi Susu'), qty: 4 }] },
    });
    expect(noAddr.statusCode).toBe(400);
    const res = await call(app, 'publicOrderCreate', {
      cookie,
      body: {
        items: [{ itemId: ids.item('Kopi Susu'), qty: 4 }],
        addressId,
        paymentMethod: 'aba',
        note: 'es dipisah',
      },
    });
    expect(res.statusCode, res.body).toBe(200);
    const { order } = PublicOrderResponse.parse(res.json());
    expect(order).toMatchObject({
      channel: 'telegram',
      type: 'delivery',
      status: 'pending_accept',
      paymentMethod: 'aba',
      subtotal: 24000,
      deliveryFee: 1500,
      total: 25500,
      address: { id: addressId },
      proofUploaded: false,
    });
    expect(Object.keys(order)).not.toContain('payments');
    orderId = order.id;
    // Notifikasi Telegram diantrikan (antrian mati di test → dicatat).
    expect(app.jobs.disabledLog.some((j) => j.name === 'telegram-notify')).toBe(true);
    await patchSettings(app.db, { delivery: { minOrder: 0, defaultFee: 0 } });
  });

  it('cashier cannot accept ABA order before proof', async () => {
    const res = await call(app, 'orderAccept', { cookie: kasir, params: { id: orderId } });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('PROOF_REQUIRED');
  });

  it('proof upload → pending_verification + admin job; verify → paid', async () => {
    const up = multipart('bukti.png', 'image/png', TINY_PNG);
    const res = await app.inject({
      method: 'POST',
      url: `/api/public/orders/${orderId}/proof`,
      payload: up.payload,
      headers: { ...up.headers, cookie },
    });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json().order).toMatchObject({ paymentStatus: 'pending_verification', proofUploaded: true });
    expect(app.jobs.disabledLog.some((j) => j.name === 'telegram-admin')).toBe(true);

    const bad = multipart('x.txt', 'text/plain', Buffer.from('hello'));
    const badRes = await app.inject({
      method: 'POST',
      url: `/api/public/orders/${orderId}/proof`,
      payload: bad.payload,
      headers: { ...bad.headers, cookie },
    });
    expect(badRes.statusCode).toBe(415);

    const staff = (await call(app, 'orderGet', { cookie: kasir, params: { id: orderId } })).json().order;
    expect(staff.proofUrl).toMatch(/^\/uploads\/private\/proofs\//);
    const file = await app.inject({ method: 'GET', url: staff.proofUrl, headers: { cookie: kasir } });
    expect(file.statusCode).toBe(200);
    const anon = await app.inject({ method: 'GET', url: staff.proofUrl });
    expect(anon.statusCode).toBe(401);

    const acc = await call(app, 'orderAccept', { cookie: kasir, params: { id: orderId } });
    expect(acc.statusCode, acc.body).toBe(200);
    const paymentId = staff.payments[0].id;
    const v = await call(app, 'paymentVerify', {
      cookie: kasir,
      params: { id: paymentId },
      body: { approved: true },
    });
    expect(v.statusCode, v.body).toBe(200);
    expect(v.json().order).toMatchObject({ paymentStatus: 'paid', paidMain: 25500 });

    const pub = await call(app, 'publicOrderGet', { cookie, params: { id: orderId } });
    expect(pub.json().order).toMatchObject({ status: 'accepted', paymentStatus: 'paid' });
    const mine = await call(app, 'publicOrdersMine', { cookie });
    expect(mine.json().orders[0].id).toBe(orderId);
  });

  it('other customers cannot read the order', async () => {
    const s = await call(app, 'publicOrderCreate', {
      body: {
        type: 'delivery',
        items: [{ itemId: ids.item('Kopi Hitam'), qty: 1 }],
        contact: { name: 'Tamu', phone: '0123', addressText: 'Hotel A', lat: 10.6, lng: 103.5 },
      },
    });
    expect(s.statusCode, s.body).toBe(200);
    const guest = mergeCookies(undefined, s);
    expect(s.json().order).toMatchObject({ channel: 'website', type: 'delivery', status: 'pending_accept' });
    const res = await call(app, 'publicOrderGet', { cookie: guest, params: { id: orderId } });
    expect(res.statusCode).toBe(403);
    const sess = await call(app, 'publicSession', { cookie: guest });
    expect(sess.json()).toMatchObject({ mode: 'none', customer: { name: 'Tamu', phone: '0123' } });
  });

  it('reject with reason; store closed blocks public orders', async () => {
    const s = await call(app, 'publicOrderCreate', {
      cookie,
      body: { items: [{ itemId: ids.item('Kopi Susu'), qty: 1 }], addressId },
    });
    const rej = await call(app, 'orderReject', {
      cookie: kasir,
      params: { id: s.json().order.id },
      body: { reason: 'Kurir penuh' },
    });
    expect(rej.json().order).toMatchObject({ status: 'rejected', rejectReason: 'Kurir penuh' });

    await patchSettings(app.db, { hours: { open: '08:00', close: '03:00' } });
    clock.set(new Date('2031-05-05T05:00:00+07:00'));
    const closed = await call(app, 'publicOrderCreate', {
      cookie,
      body: { items: [{ itemId: ids.item('Kopi Susu'), qty: 1 }], addressId },
    });
    expect(closed.statusCode).toBe(422);
    expect(closed.json().error.code).toBe('STORE_CLOSED');
    const settings = await call(app, 'publicSettings');
    expect(settings.json()).toMatchObject({ isOpen: false, name: 'Rumah Makan Berkat' });
    clock.reset();
    await open24h(app);
  });
});

describe('telegram disabled', () => {
  it('without bot token the webhook no-ops and initData is only accepted in non-prod', async () => {
    const plain = await createTestApp();
    await plain.ready();
    const res = await plain.inject({ method: 'POST', url: '/tg/webhook', payload: { update_id: 1 } });
    expect(res.statusCode).toBe(200);
    const unsigned = new URLSearchParams({
      auth_date: String(Math.floor(Date.now() / 1000)),
      user: JSON.stringify(tgUser),
    });
    const s = await call(plain, 'publicSessionTelegram', { body: { initData: unsigned.toString() } });
    expect(s.statusCode).toBe(200);
    await plain.close();
  });
});

describe('jam buka beberapa sesi', () => {
  it('istirahat siang: website tutup, jam buka berikutnya, order ditolak; open/close otomatis', async () => {
    const app = await createTestApp();
    await app.ready();
    const s = await patchSettings(app.db, {
      hours: {
        periods: [
          { open: '08:00', close: '14:00' },
          { open: '17:00', close: '20:00' },
        ],
      },
    });
    expect(s.hours.open).toBe('08:00');
    expect(s.hours.close).toBe('20:00');
    clock.set(new Date('2033-03-01T15:00:00+07:00'));
    const pub = (await call(app, 'publicSettings', {})).json();
    expect(pub.isOpen).toBe(false);
    expect(pub.hours.nextOpen).toBe('17:00');
    expect(pub.hours.periods).toHaveLength(2);
    clock.set(new Date('2033-03-01T18:00:00+07:00'));
    expect((await call(app, 'publicSettings', {})).json().isOpen).toBe(true);
    clock.reset();
    await patchSettings(app.db, { hours: { periods: [], open: '00:00', close: '00:00' } });
    await app.close();
  });
});
