import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CategoriesResponse, StaffMenuResponse } from '@pos/shared';
import { call, createTestApp, loginAs } from './helpers';

let app: FastifyInstance;
let owner: string;
let kasir: string;

beforeAll(async () => {
  app = await createTestApp();
  await app.ready();
  owner = await loginAs(app, 'Owner');
  kasir = await loginAs(app, 'Kasir Pagi');
});
afterAll(async () => {
  await app.close();
});

describe('urutan kategori & menu', () => {
  it('kategori: urutan baru dipakai di daftar admin & menu kasir', async () => {
    const before = CategoriesResponse.parse(
      (await call(app, 'adminCategoriesList', { cookie: owner })).json(),
    );
    const ids = before.categories.map((c) => c.id).reverse();
    const res = await call(app, 'adminCategoriesReorder', { cookie: owner, body: { ids } });
    expect(res.statusCode).toBe(200);
    const after = CategoriesResponse.parse(
      (await call(app, 'adminCategoriesList', { cookie: owner })).json(),
    );
    expect(after.categories.map((c) => c.id)).toEqual(ids);
    const staff = StaffMenuResponse.parse((await call(app, 'menuStaff', { cookie: kasir })).json());
    expect(staff.categories.map((c) => c.id)).toEqual(ids);
  });

  it('menu dalam satu kategori bisa diurutkan', async () => {
    const staff = StaffMenuResponse.parse((await call(app, 'menuStaff', { cookie: kasir })).json());
    const cat = staff.items[0]!.categoryId;
    const inCat = staff.items.filter((i) => i.categoryId === cat).map((i) => i.id);
    expect(inCat.length).toBeGreaterThan(1);
    const ids = [...inCat].reverse();
    expect((await call(app, 'adminItemsReorder', { cookie: owner, body: { ids } })).statusCode).toBe(200);
    const again = StaffMenuResponse.parse((await call(app, 'menuStaff', { cookie: kasir })).json());
    expect(again.items.filter((i) => i.categoryId === cat).map((i) => i.id)).toEqual(ids);
  });

  it('ditolak: kasir tanpa izin, id ganda, id tidak ada', async () => {
    expect((await call(app, 'adminItemsReorder', { cookie: kasir, body: { ids: [1, 2] } })).statusCode).toBe(
      403,
    );
    expect(
      (await call(app, 'adminCategoriesReorder', { cookie: owner, body: { ids: [1, 1] } })).statusCode,
    ).toBe(400);
    expect(
      (await call(app, 'adminCategoriesReorder', { cookie: owner, body: { ids: [999999] } })).statusCode,
    ).toBe(404);
  });
});
