import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TablesResponse, TableBillDto, PublicTableBillResponse } from '@pos/shared';
import { patchSettings } from '../src/lib/settings';
import { call, createTestApp, loginAs } from './helpers';
import {
  closeAllShifts,
  menuIds,
  mergeCookies,
  open24h,
  openShift,
  resetSettings,
  tableByName,
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
  await open24h(app);
  await closeAllShifts(app);
  kasir = await loginAs(app, 'Kasir Pagi');
  owner = await loginAs(app, 'Owner');
  ids = await menuIds(app);
  await openShift(app, kasir);
});
afterAll(async () => {
  await resetSettings(app);
  await app.close();
});

const tableStatus = async (id: number) => {
  const res = TablesResponse.parse((await call(app, 'tablesList', { cookie: kasir })).json());
  return res.tables.find((t) => t.id === id)!;
};

describe('table QR flow', () => {
  it('session open → two QR orders → bill → pay → closed; next scan opens new session', async () => {
    const t = await tableByName(app, 'Meja 1');
    expect((await tableStatus(t.id)).status).toBe('empty');

    const s = await call(app, 'publicSessionTable', { body: { qrToken: t.qrToken } });
    expect(s.statusCode, s.body).toBe(200);
    expect(s.json()).toMatchObject({
      mode: 'table',
      table: { id: t.id, name: 'Meja 1' },
      tableSession: null,
    });
    const cust = mergeCookies(undefined, s);

    const o1 = await call(app, 'publicOrderCreate', {
      cookie: cust,
      body: { items: [{ itemId: ids.item('Kopi Susu'), qty: 2 }] },
    });
    expect(o1.statusCode, o1.body).toBe(200);
    expect(o1.json().order).toMatchObject({
      channel: 'qr',
      type: 'dine_in',
      status: 'pending_accept',
      total: 12000,
    });
    let st = await tableStatus(t.id);
    expect(st).toMatchObject({ status: 'qr_new', pendingQrCount: 1, runningTotal: 0 });
    const sessionId = st.session!.id;

    const acc = await call(app, 'orderAccept', { cookie: kasir, params: { id: o1.json().order.id } });
    expect(acc.statusCode, acc.body).toBe(200);
    st = await tableStatus(t.id);
    expect(st).toMatchObject({ status: 'eating', runningTotal: 12000 });

    // Tanpa requireAccept → langsung accepted, masuk sesi yang sama.
    await patchSettings(app.db, { qr: { requireAccept: false } });
    const o2 = await call(app, 'publicOrderCreate', {
      cookie: cust,
      body: { items: [{ itemId: ids.item('Nasi Putih'), qty: 3 }], note: 'ronde 2' },
    });
    expect(o2.json().order.status).toBe('accepted');
    await patchSettings(app.db, { qr: { requireAccept: true } });

    const bill = PublicTableBillResponse.parse((await call(app, 'publicTableBill', { cookie: cust })).json());
    expect(bill).toMatchObject({ total: 18000, paid: 0, remaining: 18000 });
    expect(bill.orders).toHaveLength(2);
    expect(bill.session!.id).toBe(sessionId);

    const req = await call(app, 'publicTableBillRequest', { cookie: cust });
    expect(req.json().session.status).toBe('bill_requested');
    expect((await tableStatus(t.id)).status).toBe('bill_requested');

    const staffBill = TableBillDto.parse(
      (await call(app, 'tableSession', { cookie: kasir, params: { id: t.id } })).json(),
    );
    expect(staffBill.total).toBe(18000);

    const pay = await call(app, 'paymentCreate', {
      cookie: kasir,
      body: { tableSessionId: sessionId, lines: [{ method: 'cash', currency: 'KHR', amount: 20000 }] },
    });
    expect(pay.statusCode, pay.body).toBe(200);
    expect(pay.json()).toMatchObject({ changeMain: 2000, remainingMain: 0, session: { status: 'paid' } });
    expect((await tableStatus(t.id)).status).toBe('empty');
    const paidOrders = await call(app, 'ordersList', {
      cookie: kasir,
      query: { tableSessionId: String(sessionId) },
    });
    expect(paidOrders.json().orders.every((o: { paymentStatus: string }) => o.paymentStatus === 'paid')).toBe(
      true,
    );

    // Scan berikutnya → sesi baru saat order.
    const s2 = await call(app, 'publicSessionTable', { body: { qrToken: t.qrToken } });
    expect(s2.json().tableSession).toBeNull();
    const o3 = await call(app, 'publicOrderCreate', {
      cookie: mergeCookies(undefined, s2),
      body: { items: [{ itemId: ids.item('Kerupuk'), qty: 1 }] },
    });
    const st3 = await tableStatus(t.id);
    expect(st3.session!.id).not.toBe(sessionId);
    expect(o3.json().order.table.id).toBe(t.id);
  });

  it('invalid QR token is rejected', async () => {
    const res = await call(app, 'publicSessionTable', { body: { qrToken: 'x'.repeat(32) } });
    expect(res.statusCode).toBe(404);
  });
});

describe('move & merge', () => {
  it('moves an open session to an empty table; occupied target rejected', async () => {
    const a = await tableByName(app, 'Meja 2');
    const b = await tableByName(app, 'Meja 3');
    const c = await tableByName(app, 'Meja 4');
    for (const t of [a, c]) {
      const r = await call(app, 'orderCreate', {
        cookie: kasir,
        body: { type: 'dine_in', tableId: t.id, items: [{ itemId: ids.item('Kopi Hitam'), qty: 1 }] },
      });
      expect(r.statusCode, r.body).toBe(200);
    }
    const occupied = await call(app, 'tableMove', {
      cookie: kasir,
      params: { id: a.id },
      body: { toTableId: c.id },
    });
    expect(occupied.statusCode).toBe(409);
    expect(occupied.json().error.code).toBe('TABLE_OCCUPIED');
    const mv = await call(app, 'tableMove', {
      cookie: kasir,
      params: { id: a.id },
      body: { toTableId: b.id },
    });
    expect(mv.statusCode, mv.body).toBe(200);
    expect(mv.json().session.tableId).toBe(b.id);
    expect((await tableStatus(a.id)).status).toBe('empty');
    expect(await tableStatus(b.id)).toMatchObject({ status: 'eating', runningTotal: 5000 });

    const merge = await call(app, 'tablesMerge', {
      cookie: kasir,
      body: { fromTableId: b.id, toTableId: c.id },
    });
    expect(merge.statusCode, merge.body).toBe(200);
    expect((await tableStatus(b.id)).status).toBe('empty');
    expect(await tableStatus(c.id)).toMatchObject({ runningTotal: 10000, orderCount: 2 });
    const bill = await call(app, 'tableSession', { cookie: kasir, params: { id: c.id } });
    expect(bill.json().orders).toHaveLength(2);
    expect(bill.json().orders.every((o: { table: { id: number } }) => o.table.id === c.id)).toBe(true);
  });
});

describe('admin tables & QR', () => {
  it('regenerates QR token (old token no longer valid)', async () => {
    const t = await tableByName(app, 'Teras 1');
    const res = await call(app, 'adminTableRegenerateQr', { cookie: owner, params: { id: t.id } });
    expect(res.statusCode).toBe(200);
    expect(res.json().table.qrToken).not.toBe(t.qrToken);
    expect(res.json().table.qrToken.length).toBeGreaterThanOrEqual(24);
    expect(res.json().table.qrUrl).toBe(`http://localhost:5174/m/${res.json().table.qrToken}`);
    const old = await call(app, 'publicSessionTable', { body: { qrToken: t.qrToken } });
    expect(old.statusCode).toBe(404);
  });

  it('creates/updates/deletes tables', async () => {
    const c = await call(app, 'adminTableCreate', {
      cookie: owner,
      body: { name: 'VIP 1', area: 'VIP', seats: 8 },
    });
    expect(c.statusCode).toBe(200);
    const id = c.json().table.id;
    const u = await call(app, 'adminTableUpdate', { cookie: owner, params: { id }, body: { seats: 10 } });
    expect(u.json().table.seats).toBe(10);
    const d = await call(app, 'adminTableDelete', { cookie: owner, params: { id } });
    expect(d.statusCode).toBe(200);
    const list = await call(app, 'adminTablesList', { cookie: owner });
    expect(list.json().tables.find((t: { id: number }) => t.id === id)).toBeUndefined();
  });

  it('GET /admin/tables/qr.pdf returns a PDF', async () => {
    const res = await call(app, 'adminTablesQrPdf', { cookie: owner });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect(res.rawPayload.subarray(0, 5).toString()).toBe('%PDF-');
    const t = await tableByName(app, 'Meja 1');
    const one = await call(app, 'adminTablesQrPdf', { cookie: owner, query: { ids: String(t.id) } });
    expect(one.statusCode).toBe(200);
    expect(one.rawPayload.length).toBeGreaterThan(1000);
    const forbidden = await call(app, 'adminTablesQrPdf', { cookie: kasir });
    expect(forbidden.statusCode).toBe(403);
  });
});
