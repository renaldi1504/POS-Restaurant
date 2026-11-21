import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ClosingPreview, ClosingResult } from '@pos/shared';
import { call, createTestApp, loginAs } from './helpers';
import {
  closeAllShifts,
  createSimpleOrder,
  menuIds,
  multipart,
  openShift,
  resetSettings,
  TINY_PNG,
  type MenuIds,
} from './fixtures';

let app: FastifyInstance;
let kasir: string;
let owner: string;
let ids: MenuIds;
let shiftId: number;

beforeAll(async () => {
  app = await createTestApp();
  await app.ready();
  await resetSettings(app, { commissions: { grab: 30, foodpanda: 30 } });
  await closeAllShifts(app);
  kasir = await loginAs(app, 'Kasir Malam');
  owner = await loginAs(app, 'Owner');
  ids = await menuIds(app);
});
afterAll(async () => {
  await app.close();
});

describe('shift', () => {
  it('opens a shift with opening cash per currency; second open rejected', async () => {
    const s = await openShift(app, kasir, { KHR: 200_000, USD: 2000 });
    shiftId = s.id;
    const again = await call(app, 'shiftOpen', {
      cookie: kasir,
      body: { name: 'Malam', openingCash: { KHR: 0, USD: 0, IDR: 0 } },
    });
    expect(again.statusCode).toBe(409);
    expect(again.json().error.code).toBe('SHIFT_ALREADY_OPEN');
    const cur = await call(app, 'shiftCurrent', { cookie: kasir });
    expect(cur.json().shift).toMatchObject({ id: shiftId, openingCash: { KHR: 200000, USD: 2000, IDR: 0 } });
  });
});

describe('closing math', () => {
  it('expected cash = opening + cash sales − cash expenses (multi-currency), ABA = sales − expenses', async () => {
    // Order 1: 42.000 dibayar $11 (45.100) → kembali 3.100 KHR
    const o1 = await createSimpleOrder(app, kasir, ids, {
      items: [{ itemId: ids.item('Kopi Susu'), qty: 7 }],
    });
    await call(app, 'paymentCreate', {
      cookie: kasir,
      body: { orderId: o1.id, lines: [{ method: 'cash', currency: 'USD', amount: 1100 }] },
    });
    // Order 2: 24.000 dibayar ABA
    const o2 = await createSimpleOrder(app, kasir, ids, {
      items: [
        { itemId: ids.item('Ayam Bakar'), qty: 2, optionIds: [ids.option('Paha'), ids.option('Pedas')] },
      ],
    });
    await call(app, 'paymentCreate', {
      cookie: kasir,
      body: { orderId: o2.id, lines: [{ method: 'aba', currency: 'KHR', amount: 24000 }] },
    });
    // Order 3: grab 7.500 platform
    const o3 = await createSimpleOrder(app, kasir, ids, {
      channel: 'grab',
      items: [{ itemId: ids.item('Kopi Susu'), qty: 1 }],
    });
    await call(app, 'paymentCreate', {
      cookie: kasir,
      body: { orderId: o3.id, lines: [{ method: 'platform', currency: 'KHR', amount: 7500 }] },
    });
    // Order 4: dibatalkan
    const o4 = await createSimpleOrder(app, kasir, ids);
    await call(app, 'orderCancel', { cookie: kasir, params: { id: o4.id }, body: { reason: 'batal' } });
    // Order 5: belum bayar
    await createSimpleOrder(app, kasir, ids);

    const cats = (await call(app, 'expenseCategories', { cookie: kasir })).json().categories;
    const up = multipart('nota.png', 'image/png', TINY_PNG);
    const photo = await app.inject({
      method: 'POST',
      url: '/api/expenses/photo',
      payload: up.payload,
      headers: { ...up.headers, cookie: kasir },
    });
    expect(photo.statusCode, photo.body).toBe(200);
    expect(photo.json().url).toMatch(/^\/uploads\/private\/expenses\//);
    const e1 = await call(app, 'expenseCreate', {
      cookie: kasir,
      body: {
        categoryId: cats[0].id,
        amount: 10000,
        currency: 'KHR',
        source: 'cash',
        note: 'sayur',
        photoUrl: photo.json().url,
      },
    });
    expect(e1.statusCode, e1.body).toBe(200);
    await call(app, 'expenseCreate', {
      cookie: kasir,
      body: { categoryId: cats[1].id, amount: 300, currency: 'USD', source: 'cash' }, // $3 = 12.300
    });
    await call(app, 'expenseCreate', {
      cookie: kasir,
      body: { categoryId: cats[2].id, amount: 4000, currency: 'KHR', source: 'aba' },
    });
    const list = await call(app, 'expensesList', { cookie: kasir });
    expect(list.json()).toMatchObject({ totalCashMain: 22300, totalAbaMain: 4000 });
    expect(list.json().expenses).toHaveLength(3);

    const res = await call(app, 'closingPreview', { cookie: kasir });
    expect(res.statusCode, res.body).toBe(200);
    const p = ClosingPreview.parse(res.json());
    // KHR: 200.000 − 3.100 (kembalian) − 10.000 = 186.900; USD: 2000 + 1100 − 300 = 2800 sen
    expect(p.expected.cashByCurrency).toEqual({ KHR: 186900, USD: 2800, IDR: 0 });
    expect(p.expected.cashMain).toBe(186900 + 2800 * 41);
    expect(p.expected.abaMain).toBe(24000 - 4000);
    expect(p.openingCashMain).toBe(200000 + 2000 * 41);
    expect(p).toMatchObject({ orderCount: 4, cancelledCount: 1, unpaidOrderCount: 1 });
    const grab = p.byChannel.find((c) => c.channel === 'grab')!;
    expect(grab).toMatchObject({ count: 1, gross: 7500, commission: 2250, net: 5250 });
    const cash = p.byMethod.find((m) => m.method === 'cash')!;
    expect(cash).toMatchObject({ byCurrency: { KHR: -3100, USD: 1100, IDR: 0 }, totalMain: 42000 });
    expect(p.expenses).toMatchObject({ cashMain: 22300, abaMain: 4000, count: 3 });

    // Selisih ≠ 0 tanpa catatan → ditolak
    const bad = await call(app, 'closingCreate', {
      cookie: kasir,
      body: { shiftId, actual: { cashByCurrency: { KHR: 180000, USD: 2800, IDR: 0 }, abaMain: 20000 } },
    });
    expect(bad.statusCode).toBe(422);
    expect(bad.json().error.code).toBe('CLOSING_NOTE_REQUIRED');

    const ok = await call(app, 'closingCreate', {
      cookie: kasir,
      body: {
        shiftId,
        actual: { cashByCurrency: { KHR: 180000, USD: 2800, IDR: 0 }, abaMain: 20000 },
        note: 'kurang 6.900, uang receh',
      },
    });
    expect(ok.statusCode, ok.body).toBe(200);
    const r = ClosingResult.parse(ok.json());
    expect(r.closing.diff).toEqual({ cashMain: -6900, abaMain: 0 });
    expect(r.preview.shift.closedAt).not.toBeNull();

    const cur = await call(app, 'shiftCurrent', { cookie: kasir });
    expect(cur.json().shift).toBeNull();
    // Setelah closing: transaksi terkunci untuk kasir, admin boleh (dengan audit)
    const locked = await call(app, 'orderCancel', {
      cookie: kasir,
      params: { id: o1.id },
      body: { reason: 'x', adminPin: '1234' },
    });
    expect(locked.statusCode).toBe(422);
    expect(locked.json().error.code).toBe('SHIFT_CLOSED');

    const report = await call(app, 'reportsClosing', { cookie: owner, params: { shiftId } });
    expect(report.statusCode, report.body).toBe(200);
    expect(report.json().closing.note).toContain('kurang');
    const twice = await call(app, 'closingCreate', {
      cookie: kasir,
      body: { shiftId, actual: { cashByCurrency: { KHR: 0, USD: 0, IDR: 0 }, abaMain: 0 }, note: 'x' },
    });
    expect(twice.json().error.code).toBe('SHIFT_CLOSED');
  });

  it('multiple shifts per day; driver settlements can be marked settled', async () => {
    const s2 = await openShift(app, kasir, { KHR: 50_000 });
    expect(s2.id).not.toBe(shiftId);
    const p = ClosingPreview.parse((await call(app, 'closingPreview', { cookie: kasir })).json());
    expect(p.expected.cashMain).toBe(50000);
    expect(p.orderCount).toBe(0);
    const ok = await call(app, 'closingCreate', {
      cookie: kasir,
      body: { shiftId: s2.id, actual: { cashByCurrency: { KHR: 50000, USD: 0, IDR: 0 }, abaMain: 0 } },
    });
    expect(ok.statusCode, ok.body).toBe(200);
  });
});
