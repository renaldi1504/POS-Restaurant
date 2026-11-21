/**
 * Celah integrasi antar-aplikasi (QA): order Telegram oleh kasir, nama/HP pelanggan diketik kasir,
 * rekening ABA di settings publik, settings untuk staf non-admin, gabung meja vs laporan/closing.
 */
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ClosingPreview, DailyReport, OrderDto } from '@pos/shared';
import { call, createTestApp, loginAs } from './helpers';
import { closeAllShifts, menuIds, openShift, resetSettings, tableByName, type MenuIds } from './fixtures';

let app: FastifyInstance;
let kasir: string;
let owner: string;
let dapur: string;
let driver: string;
let ids: MenuIds;

beforeAll(async () => {
  app = await createTestApp();
  await app.ready();
  await resetSettings(app);
  await closeAllShifts(app);
  kasir = await loginAs(app, 'Kasir Pagi');
  owner = await loginAs(app, 'Owner');
  dapur = await loginAs(app, 'Dapur');
  driver = await loginAs(app, 'Driver');
  ids = await menuIds(app);
  await openShift(app, kasir, { KHR: 50_000 });
});
afterAll(async () => {
  await app.close();
});

describe('order Telegram yang diketik kasir', () => {
  it('channel telegram, langsung diterima, HP tersimpan & terlihat driver; bukan order online', async () => {
    const res = await call(app, 'orderCreate', {
      cookie: kasir,
      body: {
        channel: 'telegram',
        type: 'delivery',
        items: [{ itemId: ids.item('Kopi Susu'), qty: 2 }],
        delivery: { name: 'Pak Budi', phone: '012 345 678', addressText: 'Jl. Ekareach 12' },
      },
    });
    expect(res.statusCode, res.body).toBe(200);
    const order = OrderDto.parse(res.json().order);
    expect(order).toMatchObject({
      channel: 'telegram',
      type: 'delivery',
      status: 'accepted',
      createdByStaff: true,
      customerName: 'Pak Budi',
    });
    expect(order.customer?.phone).toBe('012 345 678');
    expect(order.address?.text).toBe('Jl. Ekareach 12');

    // Dapur → Siap; driver melihat Telepon.
    for (const status of ['cooking', 'ready'] as const) {
      const r = await call(app, 'orderStatus', { cookie: dapur, params: { id: order.id }, body: { status } });
      expect(r.statusCode, r.body).toBe(200);
    }
    const avail = await call(app, 'driverAvailable', { cookie: driver });
    const seen = (avail.json().orders as OrderDto[]).find((o) => o.id === order.id);
    expect(seen?.customer?.phone).toBe('012 345 678');
  });

  it('channel telegram wajib delivery + alamat', async () => {
    const takeaway = await call(app, 'orderCreate', {
      cookie: kasir,
      body: { channel: 'telegram', type: 'takeaway', items: [{ itemId: ids.item('Kopi Susu'), qty: 1 }] },
    });
    expect(takeaway.statusCode).toBe(400);
    const noAddr = await call(app, 'orderCreate', {
      cookie: kasir,
      body: { channel: 'telegram', type: 'delivery', items: [{ itemId: ids.item('Kopi Susu'), qty: 1 }] },
    });
    expect(noAddr.statusCode).toBe(422);
  });
});

describe('nama & HP pelanggan bungkus', () => {
  it('customerPhone disimpan ke pelanggan; edit order memperbarui HP', async () => {
    const res = await call(app, 'orderCreate', {
      cookie: kasir,
      body: {
        type: 'takeaway',
        items: [{ itemId: ids.item('Nasi Putih'), qty: 1 }],
        customerName: 'Bu Sari',
        customerPhone: '097 111 222',
      },
    });
    expect(res.statusCode, res.body).toBe(200);
    const o = OrderDto.parse(res.json().order);
    expect(o.customerName).toBe('Bu Sari');
    expect(o.customer).toMatchObject({ name: 'Bu Sari', phone: '097 111 222' });
    expect(o.createdByStaff).toBe(true);

    const upd = await call(app, 'orderUpdate', {
      cookie: kasir,
      params: { id: o.id },
      body: { customerPhone: '097 999 000' },
    });
    expect(upd.statusCode, upd.body).toBe(200);
    expect(upd.json().order.customer.phone).toBe('097 999 000');
  });

  it('delivery tanpa HP lalu diedit dengan HP → pelanggan dibuat', async () => {
    const res = await call(app, 'orderCreate', {
      cookie: kasir,
      body: {
        type: 'delivery',
        items: [{ itemId: ids.item('Nasi Putih'), qty: 1 }],
        delivery: { name: 'Tanpa HP', addressText: 'Otres 2' },
      },
    });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json().order.customer).toBeNull();
    const upd = await call(app, 'orderUpdate', {
      cookie: kasir,
      params: { id: res.json().order.id },
      body: { delivery: { name: 'Tanpa HP', phone: '011 222 333', addressText: 'Otres 2' } },
    });
    expect(upd.statusCode, upd.body).toBe(200);
    expect(upd.json().order.customer).toMatchObject({ phone: '011 222 333' });
    expect(upd.json().order.address.text).toBe('Otres 2');
  });
});

describe('settings', () => {
  it('rekening ABA: null sampai diisi admin; patch parsial tidak menghapus field lain', async () => {
    const before = await call(app, 'publicSettings');
    expect(before.json().aba).toBeNull();
    const p1 = await call(app, 'adminSettingsUpdate', {
      cookie: owner,
      body: { payment: { aba: { accountName: 'RM BERKAT', accountNumber: '000 123 456' } } },
    });
    expect(p1.statusCode, p1.body).toBe(200);
    const p2 = await call(app, 'adminSettingsUpdate', {
      cookie: owner,
      body: { payment: { aba: { qrImageUrl: 'https://example.com/qr.png' } } },
    });
    expect(p2.statusCode, p2.body).toBe(200);
    expect(p2.json().settings.payment.aba).toEqual({
      accountName: 'RM BERKAT',
      accountNumber: '000 123 456',
      qrImageUrl: 'https://example.com/qr.png',
    });
    const pub = await call(app, 'publicSettings');
    expect(pub.json().aba).toEqual({
      accountName: 'RM BERKAT',
      accountNumber: '000 123 456',
      qrImageUrl: 'https://example.com/qr.png',
    });
    await call(app, 'adminSettingsUpdate', {
      cookie: owner,
      body: { payment: { aba: { accountName: '', accountNumber: '', qrImageUrl: null } } },
    });
  });

  it('GET /settings/staff bisa dibaca dapur & driver (admin settings tetap 403)', async () => {
    await call(app, 'adminSettingsUpdate', {
      cookie: owner,
      body: { kitchen: { lateMinutes: 20 }, shift: { names: ['Siang', 'Malam'] }, ui: { textSize: 'large' } },
    });
    for (const cookie of [dapur, driver, kasir]) {
      const r = await call(app, 'staffSettings', { cookie });
      expect(r.statusCode, r.body).toBe(200);
      expect(r.json().settings).toMatchObject({
        kitchen: { lateMinutes: 20 },
        shift: { names: ['Siang', 'Malam'] },
        ui: { textSize: 'large' },
      });
    }
    expect((await call(app, 'staffSettings')).statusCode).toBe(401);
    expect((await call(app, 'adminSettingsGet', { cookie: dapur })).statusCode).toBe(403);
    await call(app, 'adminSettingsUpdate', {
      cookie: owner,
      body: { kitchen: { lateMinutes: 15 }, shift: { names: ['Pagi', 'Malam'] }, ui: { textSize: 'normal' } },
    });
  });
});

describe('gabung meja', () => {
  it('sesi asal tidak dihitung sebagai pembayaran; laporan & closing hanya menghitung sekali', async () => {
    const before = ClosingPreview.parse((await call(app, 'closingPreview', { cookie: kasir })).json());
    const reportBefore = DailyReport.parse((await call(app, 'reportsDaily', { cookie: owner })).json());

    const a = await tableByName(app, 'Teras 3');
    const b = await tableByName(app, 'Teras 4');
    for (const t of [a, b]) {
      const r = await call(app, 'orderCreate', {
        cookie: kasir,
        body: { type: 'dine_in', tableId: t.id, items: [{ itemId: ids.item('Es Teh Manis'), qty: 1 }] },
      });
      expect(r.statusCode, r.body).toBe(200);
    }
    const merge = await call(app, 'tablesMerge', {
      cookie: kasir,
      body: { fromTableId: a.id, toTableId: b.id },
    });
    expect(merge.statusCode, merge.body).toBe(200);
    const sessionId = merge.json().session.id as number;

    const same = await call(app, 'tablesMerge', {
      cookie: kasir,
      body: { fromTableId: b.id, toTableId: b.id },
    });
    expect([400, 422]).toContain(same.statusCode);

    const map = (await call(app, 'tablesList', { cookie: kasir })).json().tables as {
      id: number;
      status: string;
      runningTotal: number;
    }[];
    expect(map.find((t) => t.id === a.id)?.status).toBe('empty');
    expect(map.find((t) => t.id === b.id)).toMatchObject({ status: 'eating', runningTotal: 8000 });

    const pay = await call(app, 'paymentCreate', {
      cookie: kasir,
      body: { tableSessionId: sessionId, lines: [{ method: 'cash', currency: 'KHR', amount: 10_000 }] },
    });
    expect(pay.statusCode, pay.body).toBe(200);
    expect(pay.json()).toMatchObject({ paidMain: 10_000, changeMain: 2000, remainingMain: 0 });

    const after = ClosingPreview.parse((await call(app, 'closingPreview', { cookie: kasir })).json());
    const cash = (p: ClosingPreview) => p.byMethod.find((m) => m.method === 'cash')?.totalMain ?? 0;
    expect(cash(after) - cash(before)).toBe(8000);
    expect(after.expected.cashMain - before.expected.cashMain).toBe(8000);
    expect(after.orderCount - before.orderCount).toBe(2);

    const reportAfter = DailyReport.parse((await call(app, 'reportsDaily', { cookie: owner })).json());
    expect(reportAfter.totalSales - reportBefore.totalSales).toBe(8000);
    expect(reportAfter.orderCount - reportBefore.orderCount).toBe(2);

    const map2 = (await call(app, 'tablesList', { cookie: kasir })).json().tables as {
      id: number;
      status: string;
    }[];
    expect(map2.find((t) => t.id === a.id)?.status).toBe('empty');
    expect(map2.find((t) => t.id === b.id)?.status).toBe('empty');
  });
});
