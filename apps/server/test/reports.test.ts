import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DailyReport, RangeReport } from '@pos/shared';
import { clock } from '../src/lib/clock';
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
let owner: string;
let ids: MenuIds;

beforeAll(async () => {
  app = await createTestApp();
  await app.ready();
  await resetSettings(app);
  await closeAllShifts(app);
  kasir = await loginAs(app, 'Kasir Pagi');
  owner = await loginAs(app, 'Owner');
  ids = await menuIds(app);
});
afterAll(async () => {
  clock.reset();
  await closeAllShifts(app);
  await app.close();
});

describe('daily report', () => {
  it('totals, per hour, per channel net, per method, top items, expenses', async () => {
    clock.set(new Date('2032-07-01T10:15:00+07:00'));
    await openShift(app, kasir);
    const pay = async (id: string, method: string, amount: number) =>
      call(app, 'paymentCreate', {
        cookie: kasir,
        body: { orderId: id, lines: [{ method, currency: 'KHR', amount }] },
      });

    const a = await createSimpleOrder(app, kasir, ids, {
      items: [{ itemId: ids.item('Kopi Susu'), qty: 3 }],
    }); // 18.000
    await pay(a.id, 'cash', 20000);
    clock.set(new Date('2032-07-01T19:40:00+07:00'));
    const b = await createSimpleOrder(app, kasir, ids, {
      items: [{ itemId: ids.item('Kopi Susu'), qty: 1 }],
      discount: { kind: 'amount', value: 1000 },
    }); // 5.000
    await pay(b.id, 'aba', 5000);
    clock.set(new Date('2032-07-02T01:10:00+07:00')); // masih hari operasional 07-01
    const c = await createSimpleOrder(app, kasir, ids, {
      channel: 'foodpanda',
      items: [{ itemId: ids.item('Kopi Hitam'), qty: 2 }],
    });
    await pay(c.id, 'platform', c.total);
    const d = await createSimpleOrder(app, kasir, ids); // tidak dibayar → tidak dihitung
    const e = await createSimpleOrder(app, kasir, ids);
    await call(app, 'orderCancel', { cookie: kasir, params: { id: e.id }, body: { reason: 'x' } });
    void d;
    const cats = (await call(app, 'expenseCategories', { cookie: kasir })).json().categories;
    await call(app, 'expenseCreate', {
      cookie: kasir,
      body: { categoryId: cats[0].id, amount: 100, currency: 'USD', source: 'cash' },
    });

    const res = await call(app, 'reportsDaily', { cookie: owner, query: { date: '2032-07-01' } });
    expect(res.statusCode, res.body).toBe(200);
    const r = DailyReport.parse(res.json());
    const fp = c.total; // 2 × 6.300 = 12.600
    expect(fp).toBe(12600);
    expect(r).toMatchObject({
      date: '2032-07-01',
      orderCount: 3,
      totalSales: 18000 + 5000 + fp,
      cancelledCount: 1,
      expensesTotal: 4100,
    });
    expect(r.averageOrder).toBe(Math.round((18000 + 5000 + fp) / 3));
    expect(r.byHour[0]!.hour).toBe(8);
    expect(r.byHour.find((h) => h.hour === 10)).toMatchObject({ total: 18000, count: 1 });
    expect(r.byHour.find((h) => h.hour === 1)).toMatchObject({ total: fp, count: 1 });
    const foodpanda = r.byChannel.find((x) => x.channel === 'foodpanda')!;
    expect(foodpanda).toMatchObject({
      gross: fp,
      commission: Math.round(fp * 0.3),
      net: fp - Math.round(fp * 0.3),
    });
    const kasirCh = r.byChannel.find((x) => x.channel === 'kasir')!;
    expect(kasirCh).toMatchObject({ count: 2, gross: 24000, discount: 1000, net: 23000 });
    expect(r.netSales).toBe(23000 + foodpanda.net);
    expect(r.byMethod.find((m) => m.method === 'cash')!.totalMain).toBe(18000);
    expect(r.topItems[0]).toMatchObject({ name: { id: 'Kopi Susu' }, qty: 4 });
    expect(r.shifts).toHaveLength(1);
    clock.reset();
  });

  it('audit log list paginates with cursor', async () => {
    const p1 = await call(app, 'auditLogs', { cookie: owner, query: { limit: '2' } });
    expect(p1.json().logs).toHaveLength(2);
    const next = p1.json().nextCursor;
    expect(next).toBeGreaterThan(0);
    const p2 = await call(app, 'auditLogs', { cookie: owner, query: { limit: '2', before: String(next) } });
    expect(p2.json().logs[0].id).toBeLessThan(next);
    expect((await call(app, 'auditLogs', { cookie: kasir })).statusCode).toBe(403);
  });
});

describe('laporan owner (rentang tanggal)', () => {
  it('total periode, per hari, menu terlaris, pengeluaran per kategori, periode sebelumnya, izin', async () => {
    // Hari 1 (2032-07-01) sudah berisi data dari tes harian; tambah hari berikutnya.
    clock.set(new Date('2032-07-02T12:00:00+07:00'));
    await closeAllShifts(app);
    await openShift(app, kasir);
    const o = await createSimpleOrder(app, kasir, ids, {
      items: [{ itemId: ids.item('Kopi Susu'), qty: 2 }],
    });
    await call(app, 'paymentCreate', {
      cookie: kasir,
      body: { orderId: o.id, lines: [{ method: 'cash', currency: 'KHR', amount: o.total }] },
    });
    const cats = (await call(app, 'expenseCategories', { cookie: kasir })).json().categories;
    await call(app, 'expenseCreate', {
      cookie: kasir,
      body: { categoryId: cats[1].id, amount: 5000, currency: 'KHR', source: 'cash' },
    });

    const daily1 = DailyReport.parse(
      (await call(app, 'reportsDaily', { cookie: owner, query: { date: '2032-07-01' } })).json(),
    );
    const res = await call(app, 'reportsRange', {
      cookie: owner,
      query: { from: '2032-07-01', to: '2032-07-02' },
    });
    expect(res.statusCode, res.body).toBe(200);
    const r = RangeReport.parse(res.json());
    expect(r.days).toBe(2);
    expect(r.totalSales).toBe(daily1.totalSales + o.total);
    expect(r.orderCount).toBe(daily1.orderCount + 1);
    expect(r.expensesTotal).toBe(daily1.expensesTotal + 5000);
    expect(r.grossProfit).toBe(r.netSales - r.expensesTotal);
    expect(r.byDay.map((d) => d.date)).toEqual(['2032-07-01', '2032-07-02']);
    expect(r.byDay[1]).toMatchObject({ sales: o.total, expenses: 5000, orders: 1 });
    expect(r.topItems[0]!.name.id).toBe('Kopi Susu');
    expect(r.expensesByCategory.reduce((a, c) => a + c.total, 0)).toBe(r.expensesTotal);
    expect(r.previous).toMatchObject({ from: '2032-06-29', to: '2032-06-30', totalSales: 0 });

    // Kasir (hanya izin harian) & rentang tidak valid
    expect(
      (await call(app, 'reportsRange', { cookie: kasir, query: { from: '2032-07-01', to: '2032-07-02' } }))
        .statusCode,
    ).toBe(403);
    expect(
      (await call(app, 'reportsRange', { cookie: owner, query: { from: '2032-07-02', to: '2032-07-01' } }))
        .statusCode,
    ).toBe(400);
    expect(
      (await call(app, 'reportsRange', { cookie: owner, query: { from: '2030-01-01', to: '2032-07-01' } }))
        .statusCode,
    ).toBe(422);
  });

  it('mencatat order & pengeluaran di hari sebenarnya walau shift kemarin lupa di-closing; order belum bayar terlihat', async () => {
    clock.set(new Date('2032-08-01T12:00:00+07:00'));
    await closeAllShifts(app);
    await openShift(app, kasir); // shift 2032-08-01, tidak di-closing
    clock.set(new Date('2032-08-02T12:00:00+07:00'));
    const paid = await createSimpleOrder(app, kasir, ids);
    await call(app, 'paymentCreate', {
      cookie: kasir,
      body: { orderId: paid.id, lines: [{ method: 'cash', currency: 'KHR', amount: paid.total }] },
    });
    const unpaid = await createSimpleOrder(app, kasir, ids);
    const cats = (await call(app, 'expenseCategories', { cookie: kasir })).json().categories;
    await call(app, 'expenseCreate', {
      cookie: kasir,
      body: { categoryId: cats[0].id, amount: 3000, currency: 'KHR', source: 'cash' },
    });
    const r = RangeReport.parse(
      (
        await call(app, 'reportsRange', { cookie: owner, query: { from: '2032-08-02', to: '2032-08-02' } })
      ).json(),
    );
    expect(r.totalSales).toBe(paid.total);
    expect(r.orderCount).toBe(1);
    expect(r.expensesTotal).toBe(3000);
    expect(r.unpaid).toEqual({ count: 1, total: unpaid.total });
    await closeAllShifts(app);
    clock.reset();
  });
});
