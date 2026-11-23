import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { OrderResponse, ListOrdersResponse } from '@pos/shared';
import { clock } from '../src/lib/clock';
import { call, createTestApp, loginAs } from './helpers';
import {
  closeAllShifts,
  createSimpleOrder,
  menuIds,
  mergeCookies,
  openShift,
  resetSettings,
  tableByName,
  type MenuIds,
} from './fixtures';

let app: FastifyInstance;
let kasir: string;
let owner: string;
let dapur: string;
let ids: MenuIds;

beforeAll(async () => {
  app = await createTestApp();
  await app.ready();
  await resetSettings(app);
  await closeAllShifts(app);
  kasir = await loginAs(app, 'Kasir Pagi');
  owner = await loginAs(app, 'Owner');
  dapur = await loginAs(app, 'Dapur');
  ids = await menuIds(app);
});
afterAll(async () => {
  clock.reset();
  await app.close();
});

describe('order creation', () => {
  it('requires an open shift for staff orders', async () => {
    const res = await call(app, 'orderCreate', {
      cookie: kasir,
      body: { type: 'takeaway', items: [{ itemId: ids.item('Nasi Putih'), qty: 1 }] },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('SHIFT_NOT_OPEN');
    await openShift(app, kasir);
  });

  it('recomputes prices server-side from DB (client prices ignored)', async () => {
    const res = await call(app, 'orderCreate', {
      cookie: kasir,
      body: {
        type: 'takeaway',
        items: [
          {
            itemId: ids.item('Ayam Goreng'),
            qty: 2,
            optionIds: [
              ids.option('Paha'),
              ids.option('Extra pedas'),
              ids.option('Nasi'),
              ids.option('Telur ceplok'),
            ],
            note: 'tanpa kol',
            unitPrice: 1,
            lineTotal: 1,
          },
          { itemId: ids.item('Kopi Susu'), qty: 1, optionIds: [ids.option('Kurang gula')], price: 0 },
        ],
        total: 5,
        subtotal: 5,
      },
    });
    expect(res.statusCode, res.body).toBe(200);
    const { order } = OrderResponse.parse(res.json());
    // Ayam Goreng 10.000 + extra pedas 1.000 + nasi 2.000 + telur 3.000 = 16.000 × 2 = 32.000
    expect(order.items[0]).toMatchObject({ unitPrice: 10000, lineTotal: 32000, qty: 2, note: 'tanpa kol' });
    expect(order.items[0]!.options.map((o) => o.optionName.id)).toEqual([
      'Paha',
      'Extra pedas',
      'Nasi',
      'Telur ceplok',
    ]);
    expect(order.items[1]).toMatchObject({ unitPrice: 6000, lineTotal: 6000 });
    expect(order).toMatchObject({
      subtotal: 38000,
      discount: 0,
      total: 38000,
      status: 'accepted',
      channel: 'kasir',
    });
    expect(order.displayNo).toBe(`#${order.number}`);
    expect(order.acceptedAt).not.toBeNull();
  });

  it('uses channel price list for grab and allows display_no override', async () => {
    const res = await call(app, 'orderCreate', {
      cookie: kasir,
      body: {
        channel: 'grab',
        type: 'takeaway',
        displayNo: 'GF-482',
        items: [{ itemId: ids.item('Kopi Susu'), qty: 1 }],
      },
    });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json().order).toMatchObject({ displayNo: 'GF-482', total: 7500, channel: 'grab' });
  });

  it('harga pilihan per channel: Grab/foodpanda pakai harganya sendiri, kosong = harga toko', async () => {
    const owner = await loginAs(app, 'Owner');
    const egg = ids.option('Telur ceplok');
    const upd = await call(app, 'adminOptionUpdate', {
      cookie: owner,
      params: { id: egg },
      body: { priceGrab: 4000, priceFoodpanda: null },
    });
    expect(upd.statusCode, upd.body).toBe(200);
    expect(upd.json().option.channelPrices).toEqual({ grab: 4000, foodpanda: null });
    const base = [ids.option('Paha'), ids.option('Tidak pedas')];
    const total = async (channel: string, withEgg: boolean) => {
      const res = await call(app, 'orderCreate', {
        cookie: kasir,
        body: {
          channel,
          type: 'takeaway',
          items: [{ itemId: ids.item('Ayam Goreng'), qty: 1, optionIds: withEgg ? [...base, egg] : base }],
        },
      });
      expect(res.statusCode, res.body).toBe(200);
      return res.json().order.total as number;
    };
    expect((await total('grab', true)) - (await total('grab', false))).toBe(4000);
    expect((await total('foodpanda', true)) - (await total('foodpanda', false))).toBe(3000);
    expect((await total('kasir', true)) - (await total('kasir', false))).toBe(3000);
    await call(app, 'adminOptionUpdate', { cookie: owner, params: { id: egg }, body: { priceGrab: null } });
  });

  it('applies a manual discount', async () => {
    const res = await call(app, 'orderCreate', {
      cookie: kasir,
      body: {
        type: 'takeaway',
        items: [{ itemId: ids.item('Kopi Hitam'), qty: 2 }],
        discount: { kind: 'pct', value: 10 },
      },
    });
    expect(res.json().order).toMatchObject({ subtotal: 10000, discount: 1000, total: 9000 });
  });

  it('rejects invalid options (missing required group, over max, unknown, sold out)', async () => {
    const ayam = ids.item('Ayam Goreng');
    const cases: number[][] = [
      [ids.option('Paha')], // pedas wajib
      [ids.option('Paha'), ids.option('Dada'), ids.option('Pedas')], // bagian max 1
      [ids.option('Paha'), ids.option('Pedas'), ids.option('Normal')], // opsi grup lain (gula & es) tidak terpasang
      [ids.option('Paha'), ids.option('Pedas'), ids.option('Tempe')], // habis
      [
        ids.option('Paha'),
        ids.option('Pedas'),
        ids.option('Nasi'),
        ids.option('Telur ceplok'),
        ids.option('Tahu'),
        ids.option('Sambal ekstra'),
      ], // tambahan max 3
    ];
    for (const optionIds of cases) {
      const res = await call(app, 'orderCreate', {
        cookie: kasir,
        body: { type: 'takeaway', items: [{ itemId: ayam, qty: 1, optionIds }] },
      });
      expect(res.statusCode, JSON.stringify(optionIds)).toBe(422);
      expect(res.json().error.code).toBe('OPTION_INVALID');
    }
  });

  it('rejects unavailable items', async () => {
    const res = await call(app, 'orderCreate', {
      cookie: kasir,
      body: {
        type: 'takeaway',
        items: [{ itemId: ids.item('Pempek Lenjer'), qty: 1, optionIds: [ids.option('Pedas')] }],
      },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('ITEM_UNAVAILABLE');
  });

  it('dine-in requires a table and auto-opens the table session', async () => {
    const bad = await call(app, 'orderCreate', {
      cookie: kasir,
      body: { type: 'dine_in', items: [{ itemId: ids.item('Nasi Putih'), qty: 1 }] },
    });
    expect(bad.statusCode).toBe(400);
    const t = await tableByName(app, 'Meja 6');
    const res = await call(app, 'orderCreate', {
      cookie: kasir,
      body: { type: 'dine_in', tableId: t.id, items: [{ itemId: ids.item('Nasi Putih'), qty: 1 }] },
    });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json().order.table).toEqual({ id: t.id, name: 'Meja 6' });
    expect(res.json().order.tableSessionId).toBeGreaterThan(0);
  });

  it('delivery order stores address and delivery fee', async () => {
    const res = await call(app, 'orderCreate', {
      cookie: kasir,
      body: {
        type: 'delivery',
        items: [{ itemId: ids.item('Nasi Putih'), qty: 2 }],
        delivery: {
          name: 'Pak Budi',
          phone: '012345',
          addressText: 'Jl. Ekareach 12',
          lat: 10.63,
          lng: 103.53,
        },
        deliveryFee: 2000,
      },
    });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json().order).toMatchObject({
      total: 6000,
      deliveryFee: 2000,
      customerName: 'Pak Budi',
      address: { text: 'Jl. Ekareach 12', lat: 10.63 },
      customer: { phone: '012345' },
    });
  });
});

describe('status transitions', () => {
  it('kitchen moves accepted → cooking → ready; invalid jumps rejected', async () => {
    const o = await createSimpleOrder(app, kasir, ids);
    const bad = await call(app, 'orderStatus', {
      cookie: dapur,
      params: { id: o.id },
      body: { status: 'done' },
    });
    expect(bad.statusCode).toBe(403);
    const toServed = await call(app, 'orderStatus', {
      cookie: kasir,
      params: { id: o.id },
      body: { status: 'served' },
    });
    expect(toServed.statusCode).toBe(422);
    expect(toServed.json().error.code).toBe('INVALID_TRANSITION');
    const c = await call(app, 'orderStatus', {
      cookie: dapur,
      params: { id: o.id },
      body: { status: 'cooking' },
    });
    expect(c.json().order.status).toBe('cooking');
    const r = await call(app, 'orderStatus', {
      cookie: dapur,
      params: { id: o.id },
      body: { status: 'ready' },
    });
    expect(r.json().order).toMatchObject({ status: 'ready' });
    expect(r.json().order.readyAt).not.toBeNull();
    const pick = await call(app, 'orderStatus', {
      cookie: kasir,
      params: { id: o.id },
      body: { status: 'picked_up' },
    });
    expect(pick.statusCode).toBe(422); // takeaway tidak bisa picked_up
    const s = await call(app, 'orderStatus', {
      cookie: kasir,
      params: { id: o.id },
      body: { status: 'served' },
    });
    expect(s.json().order.status).toBe('served');
    const d = await call(app, 'orderStatus', {
      cookie: kasir,
      params: { id: o.id },
      body: { status: 'done' },
    });
    expect(d.json().order.status).toBe('done');
    const again = await call(app, 'orderStatus', {
      cookie: kasir,
      params: { id: o.id },
      body: { status: 'cooking' },
    });
    expect(again.statusCode).toBe(422);
  });

  it('writes audit logs for transitions', async () => {
    const res = await call(app, 'auditLogs', {
      cookie: owner,
      query: { action: 'order.status', limit: '5' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().logs.length).toBeGreaterThan(0);
    expect(res.json().logs[0].entity).toBe('order');
  });

  it('cancel before payment needs only a reason', async () => {
    const o = await createSimpleOrder(app, kasir, ids);
    const res = await call(app, 'orderCancel', {
      cookie: kasir,
      params: { id: o.id },
      body: { reason: 'salah input' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().order).toMatchObject({ status: 'cancelled', cancelReason: 'salah input' });
  });

  it('cancel after payment requires admin PIN for cashier', async () => {
    const o = await createSimpleOrder(app, kasir, ids);
    const pay = await call(app, 'paymentCreate', {
      cookie: kasir,
      body: { orderId: o.id, lines: [{ method: 'cash', currency: 'KHR', amount: 2000 }] },
    });
    expect(pay.statusCode, pay.body).toBe(200);
    const noPin = await call(app, 'orderCancel', {
      cookie: kasir,
      params: { id: o.id },
      body: { reason: 'komplain' },
    });
    expect(noPin.statusCode).toBe(403);
    expect(noPin.json().error.code).toBe('ADMIN_PIN_REQUIRED');
    const wrong = await call(app, 'orderCancel', {
      cookie: kasir,
      params: { id: o.id },
      body: { reason: 'komplain', adminPin: '1111' }, // PIN kasir sendiri, bukan admin
    });
    expect(wrong.statusCode).toBe(403);
    const ok = await call(app, 'orderCancel', {
      cookie: kasir,
      params: { id: o.id },
      body: { reason: 'komplain', adminPin: '1234' },
    });
    expect(ok.statusCode, ok.body).toBe(200);
    expect(ok.json().order).toMatchObject({ status: 'cancelled', paidMain: 0 });
    const logs = await call(app, 'auditLogs', {
      cookie: owner,
      query: { action: 'order.cancel_paid', entityId: o.id },
    });
    expect(logs.json().logs[0]).toMatchObject({ reason: 'komplain' });
    expect(logs.json().logs[0].after.approvedBy.name).toBe('Owner');
  });

  it('edit before payment recomputes; after payment is locked', async () => {
    const o = await createSimpleOrder(app, kasir, ids);
    const upd = await call(app, 'orderUpdate', {
      cookie: kasir,
      params: { id: o.id },
      body: { items: [{ itemId: ids.item('Kerupuk'), qty: 3 }], note: 'cepat' },
    });
    expect(upd.statusCode, upd.body).toBe(200);
    expect(upd.json().order).toMatchObject({ total: 6000, note: 'cepat' });
    await call(app, 'paymentCreate', {
      cookie: kasir,
      body: { orderId: o.id, lines: [{ method: 'cash', currency: 'KHR', amount: 6000 }] },
    });
    const locked = await call(app, 'orderUpdate', {
      cookie: kasir,
      params: { id: o.id },
      body: { note: 'x' },
    });
    expect(locked.statusCode).toBe(422);
    expect(locked.json().error.code).toBe('ORDER_LOCKED');
  });

  it('list supports since for resync', async () => {
    const first = ListOrdersResponse.parse((await call(app, 'ordersList', { cookie: kasir })).json());
    const o = await createSimpleOrder(app, kasir, ids);
    const res = await call(app, 'ordersList', { cookie: kasir, query: { since: first.serverTime } });
    const list = ListOrdersResponse.parse(res.json());
    expect(list.orders.map((x) => x.id)).toEqual([o.id]);
    const active = await call(app, 'ordersList', { cookie: dapur, query: { status: 'accepted,cooking' } });
    expect(active.statusCode).toBe(200);
    expect(
      active.json().orders.every((x: { status: string }) => ['accepted', 'cooking'].includes(x.status)),
    ).toBe(true);
  });
});

describe('daily numbering & business date', () => {
  it('numbers per business_date, rolling over at closing time (03:00), not midnight', async () => {
    await closeAllShifts(app);
    const t = await tableByName(app, 'Teras 4');
    const s = await call(app, 'publicSessionTable', { body: { qrToken: t.qrToken } });
    const cust = mergeCookies(undefined, s);
    const qr = async () => {
      const r = await call(app, 'publicOrderCreate', {
        cookie: cust,
        body: { items: [{ itemId: ids.item('Nasi Putih'), qty: 1 }] },
      });
      expect(r.statusCode, r.body).toBe(200);
      const full = await call(app, 'orderGet', { cookie: kasir, params: { id: r.json().order.id } });
      return full.json().order as { number: number; businessDate: string };
    };
    clock.set(new Date('2031-03-10T23:50:00+07:00'));
    expect(await qr()).toMatchObject({ businessDate: '2031-03-10', number: 1 });
    clock.set(new Date('2031-03-11T01:30:00+07:00'));
    expect(await qr()).toMatchObject({ businessDate: '2031-03-10', number: 2 });
    clock.set(new Date('2031-03-11T09:00:00+07:00'));
    expect(await qr()).toMatchObject({ businessDate: '2031-03-11', number: 1 });
    // Order staf memakai business_date shift yang terbuka.
    const shift = await openShift(app, kasir);
    expect(shift.businessDate).toBe('2031-03-11');
    const o = await createSimpleOrder(app, kasir, ids);
    expect(o.number).toBe(2);
    await closeAllShifts(app);
    clock.reset();
  });

  it('history (ordersList without date) follows a still-open shift from a previous day', async () => {
    await closeAllShifts(app);
    clock.set(new Date('2031-04-01T12:00:00+07:00'));
    const shift = await openShift(app, kasir);
    expect(shift.businessDate).toBe('2031-04-01');
    // Lupa closing: keesokan harinya order tetap masuk ke tanggal shift.
    clock.set(new Date('2031-04-02T12:00:00+07:00'));
    const o = await createSimpleOrder(app, kasir, ids);
    const res = await call(app, 'ordersList', { cookie: kasir, query: {} });
    expect(res.statusCode, res.body).toBe(200);
    const list = ListOrdersResponse.parse(res.json()).orders;
    expect(list.map((x) => x.id)).toContain(o.id);
    await closeAllShifts(app);
    clock.reset();
  });
});
