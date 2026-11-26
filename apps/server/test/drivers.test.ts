import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DriverAvailableResponse, DriverMineResponse } from '@pos/shared';
import { roles, users } from '../src/db/schema';
import { hashPin } from '../src/lib/pin';
import { call, cookieHeader, createTestApp, loginAs } from './helpers';
import { closeAllShifts, menuIds, openShift, resetSettings, type MenuIds } from './fixtures';
import { eq } from 'drizzle-orm';

let app: FastifyInstance;
let kasir: string;
let dapur: string;
let driver1: string;
let driver2: string;
let ids: MenuIds;

async function deliveryReady(lat = 10.64, lng = 103.53) {
  const r = await call(app, 'orderCreate', {
    cookie: kasir,
    body: {
      type: 'delivery',
      items: [{ itemId: ids.item('Kopi Susu'), qty: 2 }],
      delivery: { name: 'Ibu Sari', phone: '099', addressText: 'Victory Hill', lat, lng },
      deliveryFee: 1000,
    },
  });
  expect(r.statusCode, r.body).toBe(200);
  const id = r.json().order.id as string;
  await call(app, 'orderStatus', { cookie: dapur, params: { id }, body: { status: 'cooking' } });
  const ready = await call(app, 'orderStatus', { cookie: dapur, params: { id }, body: { status: 'ready' } });
  expect(ready.json().order.status).toBe('ready');
  return id;
}

beforeAll(async () => {
  app = await createTestApp();
  await app.ready();
  await resetSettings(app);
  await closeAllShifts(app);
  kasir = await loginAs(app, 'Kasir Pagi');
  dapur = await loginAs(app, 'Dapur');
  driver1 = await loginAs(app, 'Driver');
  // Driver kedua
  const [role] = await app.db.select().from(roles).where(eq(roles.name, 'Driver'));
  const [u] = await app.db
    .insert(users)
    .values({ name: 'Driver Dua', roleId: role!.id, pinHash: await hashPin('5555'), lang: 'kh' })
    .returning();
  const login = await call(app, 'authPin', { body: { userId: u!.id, pin: '5555' } });
  driver2 = cookieHeader(login);
  ids = await menuIds(app);
  await openShift(app, kasir);
});
afterAll(async () => {
  await app.db.update(users).set({ active: false }).where(eq(users.name, 'Driver Dua'));
  await app.close();
});

describe('driver flow', () => {
  it('available lists ready delivery orders with haversine distance & nav URL', async () => {
    const id = await deliveryReady();
    const res = await call(app, 'driverAvailable', { cookie: driver1 });
    expect(res.statusCode, res.body).toBe(200);
    const body = DriverAvailableResponse.parse(res.json());
    const o = body.orders.find((x) => x.id === id)!;
    expect(o.distanceKm).toBeGreaterThan(1);
    expect(o.distanceKm).toBeLessThan(3);
    expect(o.navigateUrl).toBe('https://www.google.com/maps/dir/?api=1&destination=10.64,103.53');
    expect(o.cashToCollect).toBe(13000);
    const k = await call(app, 'driverAvailable', { cookie: kasir });
    expect(k.statusCode).toBe(403);
  });

  it('two drivers race to take the same order: exactly one wins', async () => {
    const id = await deliveryReady();
    const [a, b] = await Promise.all([
      call(app, 'driverTake', { cookie: driver1, params: { id } }),
      call(app, 'driverTake', { cookie: driver2, params: { id } }),
    ]);
    const codes = [a.statusCode, b.statusCode].sort();
    expect(codes).toEqual([200, 409]);
    const loser = a.statusCode === 409 ? a : b;
    expect(loser.json().error.code).toBe('ALREADY_TAKEN');
    const avail = DriverAvailableResponse.parse(
      (await call(app, 'driverAvailable', { cookie: driver1 })).json(),
    );
    expect(avail.orders.find((x) => x.id === id)).toBeUndefined();
  });

  it('take → picked → delivered with cash collected → done, cash carried', async () => {
    const id = await deliveryReady();
    expect((await call(app, 'driverTake', { cookie: driver1, params: { id } })).statusCode).toBe(200);
    const notMine = await call(app, 'driverPicked', { cookie: driver2, params: { id } });
    expect(notMine.statusCode).toBe(403);
    const picked = await call(app, 'driverPicked', { cookie: driver1, params: { id } });
    expect(picked.json().order.status).toBe('picked_up');
    const mine = DriverMineResponse.parse((await call(app, 'driverMine', { cookie: driver1 })).json());
    expect(mine.orders.map((o) => o.id)).toContain(id);
    expect(mine.navigateAllUrl).toContain('destination=');

    const short = await call(app, 'driverDelivered', {
      cookie: driver1,
      params: { id },
      body: { collected: { currency: 'KHR', amount: 5000 } },
    });
    expect(short.statusCode).toBe(422);
    const del = await call(app, 'driverDelivered', {
      cookie: driver1,
      params: { id },
      body: { collected: { currency: 'USD', amount: 500 } }, // $5 = 20.500 ៛ → kembali 7.500
    });
    expect(del.statusCode, del.body).toBe(200);
    expect(del.json().order).toMatchObject({ status: 'done', paymentStatus: 'paid', cashToCollect: 0 });
    const after = DriverMineResponse.parse((await call(app, 'driverMine', { cookie: driver1 })).json());
    expect(after.cashCarried).toBeGreaterThanOrEqual(13000);
    expect(after.deliveredCount).toBeGreaterThanOrEqual(1);
  });

  it('release puts order back to ready for others', async () => {
    const id = await deliveryReady();
    await call(app, 'driverTake', { cookie: driver2, params: { id } });
    await call(app, 'driverPicked', { cookie: driver2, params: { id } });
    const rel = await call(app, 'driverRelease', {
      cookie: driver2,
      params: { id },
      body: { reason: 'ban bocor' },
    });
    expect(rel.statusCode, rel.body).toBe(200);
    expect(rel.json().order).toMatchObject({ status: 'ready', driver: null });
    const take = await call(app, 'driverTake', { cookie: driver1, params: { id } });
    expect(take.statusCode).toBe(200);
  });

  it('grab orders are not offered to restaurant drivers', async () => {
    const r = await call(app, 'orderCreate', {
      cookie: kasir,
      body: {
        channel: 'grab',
        type: 'delivery',
        displayNo: 'GF-1',
        items: [{ itemId: ids.item('Kopi Susu'), qty: 1 }],
        delivery: { name: 'Grab', addressText: 'via app' },
      },
    });
    const id = r.json().order.id;
    await call(app, 'orderStatus', { cookie: dapur, params: { id }, body: { status: 'ready' } });
    const avail = DriverAvailableResponse.parse(
      (await call(app, 'driverAvailable', { cookie: driver1 })).json(),
    );
    expect(avail.orders.find((x) => x.id === id)).toBeUndefined();
  });

  it('closing preview lists driver settlement; settling clears cash carried', async () => {
    const p = await call(app, 'closingPreview', { cookie: kasir });
    expect(p.statusCode, p.body).toBe(200);
    const d = p.json().drivers.find((x: { driver: { name: string } }) => x.driver.name === 'Driver');
    expect(d).toMatchObject({ deliveries: 1, cashCollected: 13000, settledAt: null });
    // Closing ditolak selama uang masih di driver
    const blocked = await call(app, 'closingCreate', {
      cookie: kasir,
      body: { shiftId: p.json().shift.id, actual: { cashByCurrency: { KHR: 0, USD: 0, IDR: 0 } }, note: 'x' },
    });
    expect(blocked.json().error.code).toBe('CLOSING_DRIVERS_UNSETTLED');
    const s = await call(app, 'driverSettlementSettle', { cookie: kasir, params: { id: d.id } });
    expect(s.statusCode, s.body).toBe(200);
    expect(s.json().settlement.settledAt).not.toBeNull();
    const mine = DriverMineResponse.parse((await call(app, 'driverMine', { cookie: driver1 })).json());
    expect(mine.cashCarried).toBe(0);
  });
});
