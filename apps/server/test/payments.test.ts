import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CreatePaymentResponse } from '@pos/shared';
import { call, createTestApp, loginAs } from './helpers';
import {
  closeAllShifts,
  createSimpleOrder,
  menuIds,
  openShift,
  resetSettings,
  type MenuIds,
} from './fixtures';

let app: FastifyInstance;
let kasir: string;
let dapur: string;
let ids: MenuIds;

beforeAll(async () => {
  app = await createTestApp();
  await app.ready();
  await resetSettings(app);
  await closeAllShifts(app);
  kasir = await loginAs(app, 'Kasir Pagi');
  dapur = await loginAs(app, 'Dapur');
  ids = await menuIds(app);
  await openShift(app, kasir);
});
afterAll(async () => {
  await app.close();
});

describe('payments', () => {
  it('cash in USD converts to KHR and computes change', async () => {
    // 2× Ayam Bakar? use Kopi Susu ×7 = 42.000 ៛
    const o = await createSimpleOrder(app, kasir, ids, {
      items: [{ itemId: ids.item('Kopi Susu'), qty: 7 }],
    });
    expect(o.total).toBe(42000);
    const res = await call(app, 'paymentCreate', {
      cookie: kasir,
      body: { orderId: o.id, lines: [{ method: 'cash', currency: 'USD', amount: 1100 }] }, // $11 = 45.100 ៛
    });
    expect(res.statusCode, res.body).toBe(200);
    const body = CreatePaymentResponse.parse(res.json());
    expect(body).toMatchObject({ paidMain: 45100, changeMain: 3100, remainingMain: 0 });
    expect(body.payments[0]).toMatchObject({
      currency: 'USD',
      amount: 1100,
      amountMain: 45100,
      changeMain: 3100,
    });
    expect(body.order).toMatchObject({ paymentStatus: 'paid', paidMain: 42000 });
  });

  it('cash in IDR converts with rate 0.25', async () => {
    const o = await createSimpleOrder(app, kasir, ids, {
      items: [{ itemId: ids.item('Kopi Hitam'), qty: 1 }],
    });
    const res = await call(app, 'paymentCreate', {
      cookie: kasir,
      body: { orderId: o.id, lines: [{ method: 'cash', currency: 'IDR', amount: 20000 }] }, // 5.000 ៛
    });
    expect(res.json()).toMatchObject({ paidMain: 5000, changeMain: 0, remainingMain: 0 });
  });

  it('insufficient payment is rejected unless partial', async () => {
    const o = await createSimpleOrder(app, kasir, ids, {
      items: [{ itemId: ids.item('Kopi Susu'), qty: 2 }],
    });
    const res = await call(app, 'paymentCreate', {
      cookie: kasir,
      body: { orderId: o.id, lines: [{ method: 'cash', currency: 'KHR', amount: 10000 }] },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('PAYMENT_INSUFFICIENT');
  });

  it('split payment: ABA + cash KHR in one call, change from cash only', async () => {
    const o = await createSimpleOrder(app, kasir, ids, {
      items: [
        { itemId: ids.item('Ayam Bakar'), qty: 2, optionIds: [ids.option('Dada'), ids.option('Sedang')] },
      ],
    });
    expect(o.total).toBe(24000);
    const res = await call(app, 'paymentCreate', {
      cookie: kasir,
      body: {
        orderId: o.id,
        lines: [
          { method: 'aba', currency: 'KHR', amount: 14000 },
          { method: 'cash', currency: 'KHR', amount: 20000 },
        ],
      },
    });
    expect(res.statusCode, res.body).toBe(200);
    const body = CreatePaymentResponse.parse(res.json());
    expect(body.payments).toHaveLength(2);
    expect(body.payments[1]).toMatchObject({ method: 'cash', changeMain: 10000 });
    expect(body).toMatchObject({ changeMain: 10000, remainingMain: 0 });
  });

  it('split over several calls with partial=true', async () => {
    const o = await createSimpleOrder(app, kasir, ids, {
      items: [{ itemId: ids.item('Es Teh Manis'), qty: 3 }],
    });
    const a = await call(app, 'paymentCreate', {
      cookie: kasir,
      body: { orderId: o.id, partial: true, lines: [{ method: 'cash', currency: 'KHR', amount: 6000 }] },
    });
    expect(a.json()).toMatchObject({ remainingMain: 6000 });
    expect(a.json().order.paymentStatus).toBe('unpaid');
    const b = await call(app, 'paymentCreate', {
      cookie: kasir,
      body: { orderId: o.id, partial: true, lines: [{ method: 'aba', currency: 'KHR', amount: 6000 }] },
    });
    expect(b.json()).toMatchObject({ remainingMain: 0 });
    expect(b.json().order.paymentStatus).toBe('paid');
    const again = await call(app, 'paymentCreate', {
      cookie: kasir,
      body: { orderId: o.id, lines: [{ method: 'cash', currency: 'KHR', amount: 100 }] },
    });
    expect(again.statusCode).toBe(409);
  });

  it('non-cash overpay is rejected; disabled currency rejected', async () => {
    const o = await createSimpleOrder(app, kasir, ids);
    const over = await call(app, 'paymentCreate', {
      cookie: kasir,
      body: { orderId: o.id, lines: [{ method: 'aba', currency: 'KHR', amount: 5000 }] },
    });
    expect(over.statusCode).toBe(422);
  });

  it('kitchen cannot create payments; cashier cannot access admin', async () => {
    const o = await createSimpleOrder(app, kasir, ids);
    const res = await call(app, 'paymentCreate', {
      cookie: dapur,
      body: { orderId: o.id, lines: [{ method: 'cash', currency: 'KHR', amount: 2000 }] },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('FORBIDDEN');
    for (const key of ['adminUsersList', 'adminSettingsGet', 'adminItemsList', 'reportsDaily'] as const) {
      const r = await call(app, key, { cookie: kasir });
      expect(r.statusCode, key).toBe(403);
    }
    const noAuth = await call(app, 'ordersList');
    expect(noAuth.statusCode).toBe(401);
  });
});
