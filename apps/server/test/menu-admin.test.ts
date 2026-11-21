import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AdminSettingsResponse, PublicMenuResponse, StaffMenuResponse } from '@pos/shared';
import { call, createTestApp, loginAs, userIdByName } from './helpers';
import { menuIds, multipart, resetSettings, TINY_PNG, type MenuIds } from './fixtures';

let app: FastifyInstance;
let owner: string;
let kasir: string;
let dapur: string;
let ids: MenuIds;

beforeAll(async () => {
  app = await createTestApp();
  await app.ready();
  await resetSettings(app);
  owner = await loginAs(app, 'Owner');
  kasir = await loginAs(app, 'Kasir Pagi');
  dapur = await loginAs(app, 'Dapur');
  ids = await menuIds(app);
});
afterAll(async () => {
  await app.close();
});

describe('menu', () => {
  it('staff menu has all channel prices; public menu has store price, sold-out last', async () => {
    const staff = StaffMenuResponse.parse((await call(app, 'menuStaff', { cookie: dapur })).json());
    const ayam = staff.items.find((i) => i.name.id === 'Ayam Goreng')!;
    expect(ayam.prices).toEqual({ store: 10000, grab: 12500, foodpanda: 12500 });
    expect(ayam.optionGroupIds).toHaveLength(3);
    const pub = PublicMenuResponse.parse((await call(app, 'publicMenu', { query: { lang: 'en' } })).json());
    expect(pub.items.at(-1)!.available).toBe(false);
    expect(pub.items.find((i) => i.name.id === 'Kopi Susu')!.price).toBe(6000);
    expect(pub.categories.find((c) => c.name.id === 'Ayam')!.itemCount).toBe(2);
    expect(JSON.stringify(pub)).not.toContain('aiInfo');
  });

  it('availability toggles (kitchen allowed, driver not) with audit', async () => {
    const id = ids.item('Kerupuk');
    const off = await call(app, 'menuItemAvailability', {
      cookie: dapur,
      params: { id },
      body: { available: false },
    });
    expect(off.json()).toEqual({ id, available: false });
    const on = await call(app, 'menuItemAvailability', {
      cookie: kasir,
      params: { id },
      body: { available: true },
    });
    expect(on.json().available).toBe(true);
    const opt = await call(app, 'menuOptionAvailability', {
      cookie: dapur,
      params: { id: ids.option('Tahu') },
      body: { available: true },
    });
    expect(opt.statusCode).toBe(200);
    const driver = await loginAs(app, 'Driver');
    const no = await call(app, 'menuItemAvailability', {
      cookie: driver,
      params: { id },
      body: { available: false },
    });
    expect(no.statusCode).toBe(403);
  });

  it('admin CRUD: category, item with prices & groups, photo, option group replace/attach, promo', async () => {
    const cat = await call(app, 'adminCategoryCreate', {
      cookie: owner,
      body: { name: { id: 'Mie' }, sort: 9 },
    });
    expect(cat.statusCode).toBe(200);
    const catId = cat.json().category.id;
    const g = await call(app, 'adminOptionGroupCreate', {
      cookie: owner,
      body: {
        name: { id: 'Ukuran' },
        required: true,
        minSelect: 1,
        maxSelect: 1,
        options: [{ name: { id: 'Biasa' } }, { name: { id: 'Jumbo' }, priceDelta: 3000 }],
      },
    });
    expect(g.statusCode, g.body).toBe(200);
    const group = g.json().optionGroup;
    const item = await call(app, 'adminItemCreate', {
      cookie: owner,
      body: {
        categoryId: catId,
        name: { id: 'Mie Goreng' },
        prices: { store: 9000, grab: 11000 },
        optionGroupIds: [group.id],
        aiInfo: 'pedas sedang',
      },
    });
    expect(item.statusCode, item.body).toBe(200);
    const itemId = item.json().item.id;
    expect(item.json().item.prices).toEqual({ store: 9000, grab: 11000, foodpanda: null });

    const upd = await call(app, 'adminItemUpdate', {
      cookie: owner,
      params: { id: itemId },
      body: { prices: { grab: null, foodpanda: 12000 }, bestSeller: true },
    });
    expect(upd.json().item).toMatchObject({
      bestSeller: true,
      prices: { store: 9000, grab: null, foodpanda: 12000 },
    });

    const up = multipart('mie.png', 'image/png', TINY_PNG);
    const photo = await app.inject({
      method: 'POST',
      url: `/api/admin/items/${itemId}/photo`,
      payload: up.payload,
      headers: { ...up.headers, cookie: owner },
    });
    expect(photo.statusCode, photo.body).toBe(200);
    expect(photo.json().item.photoUrl).toMatch(/^\/uploads\/public\/menu\/.+\.png$/);
    const file = await app.inject({ method: 'GET', url: photo.json().item.photoUrl });
    expect(file.statusCode).toBe(200);

    // Replace options: keep "Biasa" (id lama), ganti Jumbo → Besar
    const biasa = group.options.find((o: { name: { id: string } }) => o.name.id === 'Biasa');
    const rep = await call(app, 'adminOptionGroupUpdate', {
      cookie: owner,
      params: { id: group.id },
      body: {
        options: [
          { id: biasa.id, name: { id: 'Biasa' } },
          { name: { id: 'Besar' }, priceDelta: 2000 },
        ],
      },
    });
    expect(rep.json().optionGroup.options.map((o: { name: { id: string } }) => o.name.id)).toEqual([
      'Biasa',
      'Besar',
    ]);
    expect(rep.json().optionGroup.options[0].id).toBe(biasa.id);
    const att = await call(app, 'adminOptionGroupAttach', {
      cookie: owner,
      params: { id: group.id },
      body: { itemIds: [itemId, ids.item('Nasi Putih')] },
    });
    expect(att.json().optionGroup.itemIds.sort()).toEqual([itemId, ids.item('Nasi Putih')].sort());
    const detach = await call(app, 'adminOptionGroupAttach', {
      cookie: owner,
      params: { id: group.id },
      body: { itemIds: [itemId] },
    });
    expect(detach.json().optionGroup.itemIds).toEqual([itemId]);

    const oc = await call(app, 'adminOptionCreate', {
      cookie: owner,
      params: { id: group.id },
      body: { name: { id: 'Kecil' }, priceDelta: -1000 },
    });
    expect(oc.json().option).toMatchObject({ priceDelta: -1000, groupId: group.id });
    const ou = await call(app, 'adminOptionUpdate', {
      cookie: owner,
      params: { id: oc.json().option.id },
      body: { available: false },
    });
    expect(ou.json().option.available).toBe(false);
    expect(
      (await call(app, 'adminOptionDelete', { cookie: owner, params: { id: oc.json().option.id } }))
        .statusCode,
    ).toBe(200);

    const delCat = await call(app, 'adminCategoryDelete', { cookie: owner, params: { id: catId } });
    expect(delCat.statusCode).toBe(409);

    const promo = await call(app, 'adminPromoCreate', {
      cookie: owner,
      body: { name: 'Diskon Mie 10%', kind: 'pct', value: 10, scope: { itemIds: [itemId] } },
    });
    expect(promo.statusCode, promo.body).toBe(200);
    expect((await call(app, 'adminPromosList', { cookie: owner })).json().promos.length).toBeGreaterThan(0);
    const pu = await call(app, 'adminPromoUpdate', {
      cookie: owner,
      params: { id: promo.json().promo.id },
      body: { value: 20 },
    });
    expect(pu.json().promo.value).toBe(20);

    expect((await call(app, 'adminItemDelete', { cookie: owner, params: { id: itemId } })).statusCode).toBe(
      200,
    );
    expect(
      (await call(app, 'adminOptionGroupDelete', { cookie: owner, params: { id: group.id } })).statusCode,
    ).toBe(200);
    expect(
      (await call(app, 'adminPromoDelete', { cookie: owner, params: { id: promo.json().promo.id } }))
        .statusCode,
    ).toBe(200);
    expect(
      (await call(app, 'adminCategoryDelete', { cookie: owner, params: { id: catId } })).statusCode,
    ).toBe(200);
  });

  it('translate (mock without GEMINI_API_KEY) fills only empty languages unless overwrite', async () => {
    const res = await call(app, 'adminTranslate', {
      cookie: owner,
      body: {
        entries: [
          { key: 'a', text: { id: 'Ayam Penyet', en: 'Smashed Chicken (manual)' } },
          { key: 'b', text: { id: 'Es Jeruk', en: 'Orange' }, overwrite: true },
        ],
      },
    });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json().provider).toBe('mock');
    expect(res.json().entries[0].text).toEqual({
      id: 'Ayam Penyet',
      en: 'Smashed Chicken (manual)',
      kh: '[kh] Ayam Penyet',
      zh: '[zh] Ayam Penyet',
    });
    expect(res.json().entries[1].text.en).toBe('[en] Es Jeruk');
  });
});

describe('admin users, roles, settings', () => {
  it('users CRUD: PIN hashing, deactivate revokes sessions, cannot remove last owner', async () => {
    const roles = (await call(app, 'adminRolesList', { cookie: owner })).json().roles;
    const kasirRole = roles.find((r: { name: string }) => r.name === 'Kasir');
    const ownerRole = roles.find((r: { name: string }) => r.name === 'Owner');
    const c = await call(app, 'adminUserCreate', {
      cookie: owner,
      body: { name: 'Kasir Baru', roleId: kasirRole.id, pin: '8888' },
    });
    expect(c.statusCode, c.body).toBe(200);
    const uid = c.json().user.id;
    const login = await call(app, 'authPin', { body: { userId: uid, pin: '8888' } });
    expect(login.statusCode).toBe(200);
    const cookie = login.cookies.map((x) => `${x.name}=${x.value}`).join('; ');
    expect((await call(app, 'authMe', { cookie })).statusCode).toBe(200);
    const off = await call(app, 'adminUserUpdate', {
      cookie: owner,
      params: { id: uid },
      body: { active: false },
    });
    expect(off.json().user.active).toBe(false);
    expect((await call(app, 'authMe', { cookie })).statusCode).toBe(401);

    const ownerId = await userIdByName(app, 'Owner');
    const demote = await call(app, 'adminUserUpdate', {
      cookie: owner,
      params: { id: ownerId },
      body: { roleId: kasirRole.id },
    });
    expect(demote.statusCode).toBe(409);
    const strip = await call(app, 'adminRoleUpdate', {
      cookie: owner,
      params: { id: ownerRole.id },
      body: { permissions: ['order.create'] },
    });
    expect(strip.statusCode).toBe(409);
    const self = await call(app, 'adminUserDelete', { cookie: owner, params: { id: ownerId } });
    expect(self.statusCode).toBe(409);
    const bot = await call(app, 'adminUserUpdate', {
      cookie: owner,
      params: { id: await userIdByName(app, 'Bot Telegram') },
      body: { pin: '1234' },
    });
    expect(bot.statusCode).toBe(403);
  });

  it('roles: system roles editable not deletable; custom roles CRUD', async () => {
    const roles = (await call(app, 'adminRolesList', { cookie: owner })).json().roles;
    const dapurRole = roles.find((r: { name: string }) => r.name === 'Dapur');
    expect(dapurRole.system).toBe(true);
    const edit = await call(app, 'adminRoleUpdate', {
      cookie: owner,
      params: { id: dapurRole.id },
      body: { permissions: [...dapurRole.permissions, 'reports.view'] },
    });
    expect(edit.json().role.permissions).toContain('reports.view');
    await call(app, 'adminRoleUpdate', {
      cookie: owner,
      params: { id: dapurRole.id },
      body: { permissions: dapurRole.permissions },
    });
    expect(
      (await call(app, 'adminRoleDelete', { cookie: owner, params: { id: dapurRole.id } })).statusCode,
    ).toBe(403);
    const c = await call(app, 'adminRoleCreate', {
      cookie: owner,
      body: { name: 'Supervisor', permissions: ['reports.view'] },
    });
    expect(c.statusCode).toBe(200);
    expect(
      (await call(app, 'adminRoleDelete', { cookie: owner, params: { id: c.json().role.id } })).statusCode,
    ).toBe(200);
  });

  it('settings get/patch merge with defaults; logo upload; expense categories', async () => {
    const g = AdminSettingsResponse.parse((await call(app, 'adminSettingsGet', { cookie: owner })).json());
    expect(g.integrations).toMatchObject({ telegram: false, gemini: false });
    const p = await call(app, 'adminSettingsUpdate', {
      cookie: owner,
      body: { kitchen: { lateMinutes: 20 }, currency: { rates: { USD: 4050, IDR: 0.25 } } },
    });
    expect(p.statusCode, p.body).toBe(200);
    expect(p.json().settings.kitchen.lateMinutes).toBe(20);
    expect(p.json().settings.currency).toMatchObject({ main: 'KHR', rates: { USD: 4050 } });
    const bad = await call(app, 'adminSettingsUpdate', {
      cookie: owner,
      body: { currency: { enabled: ['USD'] } },
    });
    expect(bad.statusCode).toBe(400);
    await call(app, 'adminSettingsUpdate', {
      cookie: owner,
      body: { kitchen: { lateMinutes: 15 }, currency: { rates: { USD: 4100, IDR: 0.25 } } },
    });

    const up = multipart('logo.png', 'image/png', TINY_PNG);
    const logo = await app.inject({
      method: 'POST',
      url: '/api/admin/settings/logo',
      payload: up.payload,
      headers: { ...up.headers, cookie: owner },
    });
    expect(logo.statusCode, logo.body).toBe(200);
    expect(logo.json().settings.profile.logoUrl).toMatch(/^\/uploads\/public\/logo\//);
    const pdf = await call(app, 'adminTablesQrPdf', { cookie: owner });
    expect(pdf.statusCode).toBe(200);

    const ec = await call(app, 'adminExpenseCategoryCreate', { cookie: owner, body: { name: 'Sewa' } });
    expect(ec.statusCode).toBe(200);
    const eu = await call(app, 'adminExpenseCategoryUpdate', {
      cookie: owner,
      params: { id: ec.json().category.id },
      body: { name: 'Sewa tempat' },
    });
    expect(eu.json().category.name).toBe('Sewa tempat');
    expect(
      (
        await call(app, 'adminExpenseCategoryDelete', {
          cookie: owner,
          params: { id: ec.json().category.id },
        })
      ).statusCode,
    ).toBe(200);
  });
});
