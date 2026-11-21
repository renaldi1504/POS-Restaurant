import type { AddressInfo } from 'node:net';
import type { FastifyInstance } from 'fastify';
import { io as ioc, type Socket } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { call, createTestApp, loginAs } from './helpers';
import {
  closeAllShifts,
  menuIds,
  mergeCookies,
  open24h,
  openShift,
  resetSettings,
  tableByName,
} from './fixtures';

let app: FastifyInstance;
let base: string;

beforeAll(async () => {
  app = await createTestApp();
  await app.listen({ port: 0, host: '127.0.0.1' });
  base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  await app.close();
});

function connect(cookie?: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const s = ioc(base, { path: '/ws', transports: ['websocket'], extraHeaders: cookie ? { cookie } : {} });
    s.on('connect', () => resolve(s));
    s.on('connect_error', reject);
  });
}

describe('Socket.IO /ws rooms', () => {
  it('kitchen staff receives kitchen events but not driver events', async () => {
    const cookie = await loginAs(app, 'Dapur');
    const s = await connect(cookie);
    const got: string[] = [];
    s.on('menu.availability', () => got.push('kitchen'));
    app.realtime.emitStaff(['driver'], 'menu.availability', {
      kind: 'item',
      id: 1,
      available: false,
      at: new Date().toISOString(),
    });
    app.realtime.emitStaff(['kitchen'], 'menu.availability', {
      kind: 'item',
      id: 1,
      available: false,
      at: new Date().toISOString(),
    });
    await new Promise((r) => setTimeout(r, 200));
    expect(got).toEqual(['kitchen']);
    s.disconnect();
  });

  it('anonymous socket connects and can ping', async () => {
    const s = await connect();
    const t = await new Promise<string>((resolve) => s.emit('ping', resolve));
    expect(new Date(t).getTime()).toBeGreaterThan(0);
    s.disconnect();
  });
});

describe('order events routing', () => {
  it('cashier gets order.created, driver gets ready_for_pickup, QR customer gets public order.updated & table.updated', async () => {
    await resetSettings(app);
    await open24h(app);
    await closeAllShifts(app);
    const kasir = await loginAs(app, 'Kasir Pagi');
    const dapur = await loginAs(app, 'Dapur');
    const driver = await loginAs(app, 'Driver');
    await openShift(app, kasir);
    const ids = await menuIds(app);
    const t = await tableByName(app, 'Teras 2');
    const sess = await call(app, 'publicSessionTable', { body: { qrToken: t.qrToken } });
    const custCookie = mergeCookies(undefined, sess);

    const sk = await connect(kasir);
    const sd = await connect(driver);
    const sc = await connect(custCookie);
    const got: Record<string, unknown[]> = {
      kasir: [],
      driver: [],
      cust: [],
      custTable: [],
      driverCreated: [],
    };
    sk.on('order.created', (p) => got.kasir!.push(p));
    sd.on('order.ready_for_pickup', (p) => got.driver!.push(p));
    sd.on('order.created', (p) => got.driverCreated!.push(p));
    sc.on('order.updated', (p) => got.cust!.push(p));
    sc.on('table.updated', (p) => got.custTable!.push(p));

    const qr = await call(app, 'publicOrderCreate', {
      cookie: custCookie,
      body: { items: [{ itemId: ids.item('Kerupuk'), qty: 1 }] },
    });
    expect(qr.statusCode, qr.body).toBe(200);
    await new Promise((r) => setTimeout(r, 150));
    await call(app, 'orderAccept', { cookie: kasir, params: { id: qr.json().order.id } });

    const del = await call(app, 'orderCreate', {
      cookie: kasir,
      body: {
        type: 'delivery',
        items: [{ itemId: ids.item('Kerupuk'), qty: 1 }],
        delivery: { name: 'X', addressText: 'Y', lat: 10.6, lng: 103.5 },
      },
    });
    await call(app, 'orderStatus', {
      cookie: dapur,
      params: { id: del.json().order.id },
      body: { status: 'ready' },
    });
    await new Promise((r) => setTimeout(r, 300));

    expect(got.kasir!.length).toBe(2);
    expect((got.kasir![0] as { order: { payments: unknown } }).order.payments).toBeDefined();
    expect(got.driverCreated).toHaveLength(0);
    expect(got.driver).toHaveLength(1);
    const pub = got.cust![0] as { order: Record<string, unknown> };
    expect(pub.order.status).toBe('accepted');
    expect(pub.order).not.toHaveProperty('payments');
    expect(got.custTable!.length).toBeGreaterThan(0);
    for (const s of [sk, sd, sc]) s.disconnect();
    await closeAllShifts(app);
  });
});
