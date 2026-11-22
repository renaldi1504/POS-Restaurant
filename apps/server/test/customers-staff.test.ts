/**
 * Kasir: cari pelanggan, alamat tersimpan, order delivery/Telegram yang menautkan pelanggan, dan
 * resolver link pendek Google Maps (anti-SSRF).
 */
import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { CustomerAddressesResponse, CustomerSearchResponse } from '@pos/shared';
import { JOB_NAMES } from '../src/lib/jobs';
import { customers } from '../src/db/schema';
import { resolveMapsLink } from '../src/modules/geo/resolveLink';
import { call, createTestApp, loginAs } from './helpers';
import { closeAllShifts, menuIds, openShift, resetSettings, type MenuIds } from './fixtures';

let app: FastifyInstance;
let kasir: string;
let dapur: string;
let ids: MenuIds;
let tgCustomerId: number;
const tag = `x${Date.now().toString(36)}`;

beforeAll(async () => {
  app = await createTestApp();
  await app.ready();
  await resetSettings(app);
  await closeAllShifts(app);
  kasir = await loginAs(app, 'Kasir Pagi');
  dapur = await loginAs(app, 'Dapur');
  ids = await menuIds(app);
  await openShift(app, kasir);
  const [c] = await app.db
    .insert(customers)
    .values({ telegramId: `9${Date.now()}`, name: `Sokha ${tag}`, username: `sokha_${tag}`, lang: 'kh' })
    .returning();
  tgCustomerId = c!.id;
});
afterAll(async () => {
  await closeAllShifts(app);
  await app.close();
});

const item = () => [{ itemId: ids.item('Nasi Putih'), qty: 1 }];

describe('cari pelanggan', () => {
  it('butuh izin order.create (dapur ditolak) & q minimal 1 huruf', async () => {
    expect((await call(app, 'customersSearch', { cookie: dapur, query: { q: 'so' } })).statusCode).toBe(403);
    expect((await call(app, 'customersSearch', { query: { q: 'so' } })).statusCode).toBe(401);
    expect((await call(app, 'customersSearch', { cookie: kasir, query: { q: ' ' } })).statusCode).toBe(400);
  });

  it('nama, @username (tanpa beda besar-kecil) dan no HP (angka saja)', async () => {
    const created = await call(app, 'orderCreate', {
      cookie: kasir,
      body: {
        type: 'delivery',
        items: item(),
        delivery: { name: `Bu Rina ${tag}`, phone: '097 555 1234', addressText: 'Jl. Kampot 3' },
      },
    });
    expect(created.statusCode, created.body).toBe(200);

    const byName = await call(app, 'customersSearch', { cookie: kasir, query: { q: `SOKHA ${tag}` } });
    expect(byName.statusCode, byName.body).toBe(200);
    const list = CustomerSearchResponse.parse(byName.json()).customers;
    expect(list.map((c) => c.id)).toEqual([tgCustomerId]);
    expect(list[0]).toMatchObject({ username: `sokha_${tag}`, orderCount: 0, lastAddress: null });

    const byUser = await call(app, 'customersSearch', { cookie: kasir, query: { q: `@Sokha_${tag}` } });
    expect(byUser.json().customers[0].id).toBe(tgCustomerId);

    const byPhone = await call(app, 'customersSearch', { cookie: kasir, query: { q: '0975551234' } });
    const rina = byPhone.json().customers.find((c: { name: string }) => c.name === `Bu Rina ${tag}`);
    expect(rina).toMatchObject({
      phone: '097 555 1234',
      orderCount: 1,
      lastAddress: { text: 'Jl. Kampot 3' },
    });
    expect(rina.lastOrderAt).not.toBeNull();
  });

  it('% dan _ tidak dianggap wildcard; maksimal 20 hasil', async () => {
    const r = await call(app, 'customersSearch', { cookie: kasir, query: { q: '%' } });
    expect(r.json().customers).toEqual([]);
    const all = await call(app, 'customersSearch', { cookie: kasir, query: { q: 'a', limit: '50' } });
    expect(all.statusCode).toBe(400);
  });
});

describe('alamat tersimpan pelanggan', () => {
  let firstId: number;
  it('tambah alamat (dengan & tanpa titik); alamat sama tidak diduplikasi', async () => {
    const a = await call(app, 'customerAddressCreate', {
      cookie: kasir,
      params: { id: tgCustomerId },
      body: { text: 'Street 108, Sihanoukville', landmark: 'Dekat masjid', lat: 10.61, lng: 103.52 },
    });
    expect(a.statusCode, a.body).toBe(200);
    expect(a.json().address).toMatchObject({ label: 'Alamat', lat: 10.61, landmark: 'Dekat masjid' });
    firstId = a.json().address.id;
    const again = await call(app, 'customerAddressCreate', {
      cookie: kasir,
      params: { id: tgCustomerId },
      body: { text: 'street 108,  Sihanoukville', landmark: 'Dekat masjid', lat: 10.61, lng: 103.52 },
    });
    expect(again.json().address.id).toBe(firstId);
    const manual = await call(app, 'customerAddressCreate', {
      cookie: kasir,
      params: { id: tgCustomerId },
      body: { text: 'Hotel Ocean kamar 12' },
    });
    expect(manual.json().address).toMatchObject({ lat: null, lng: null });
  });

  it('daftar: terakhir dibuat/dipakai dulu; pelanggan tidak ada → 404', async () => {
    const r = await call(app, 'customerAddresses', { cookie: kasir, params: { id: tgCustomerId } });
    expect(r.statusCode, r.body).toBe(200);
    const body = CustomerAddressesResponse.parse(r.json());
    expect(body.customer.telegramId).not.toBeNull();
    expect(body.addresses.map((a) => a.text)).toEqual(['Hotel Ocean kamar 12', 'Street 108, Sihanoukville']);
    const missing = await call(app, 'customerAddresses', { cookie: kasir, params: { id: 99999999 } });
    expect(missing.statusCode).toBe(404);
    expect(missing.json().error.message).toBe('Pelanggan tidak ditemukan');
  });

  it('ubah alamat (teks, patokan, titik); alamat pelanggan lain → 404', async () => {
    const r = await call(app, 'customerAddressUpdate', {
      cookie: kasir,
      params: { id: tgCustomerId, addressId: firstId },
      body: { landmark: 'Seberang masjid', lat: 10.611 },
    });
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json().address).toMatchObject({ landmark: 'Seberang masjid', lat: 10.611, lng: 103.52 });
    const [other] = await app.db
      .insert(customers)
      .values({ name: `Lain ${tag}` })
      .returning();
    const bad = await call(app, 'customerAddressUpdate', {
      cookie: kasir,
      params: { id: other!.id, addressId: firstId },
      body: { text: 'x' },
    });
    expect(bad.statusCode).toBe(404);
  });

  it('order Telegram kasir dengan pelanggan + alamat tersimpan → tertaut & notifikasi Telegram diantre', async () => {
    const before = app.jobs.disabledLog.length;
    const r = await call(app, 'orderCreate', {
      cookie: kasir,
      body: {
        channel: 'telegram',
        type: 'delivery',
        items: item(),
        customerId: tgCustomerId,
        addressId: firstId,
        delivery: { name: `Sokha ${tag}`, phone: '012 888 999', addressText: 'diabaikan' },
      },
    });
    expect(r.statusCode, r.body).toBe(200);
    const o = r.json().order;
    expect(o).toMatchObject({
      channel: 'telegram',
      customer: { id: tgCustomerId, phone: '012 888 999' },
      address: { id: firstId, lat: 10.611 },
      customerName: `Sokha ${tag}`,
    });
    expect(o.customer.telegramId).not.toBeNull();
    const jobs = app.jobs.disabledLog.slice(before);
    expect(jobs).toContainEqual({
      name: JOB_NAMES.telegramNotify,
      data: { orderId: o.id, status: 'accepted' },
    });
    // Alamat ini sekarang alamat utama (terakhir dipakai).
    const list = await call(app, 'customerAddresses', { cookie: kasir, params: { id: tgCustomerId } });
    expect(list.json().addresses[0]).toMatchObject({ id: firstId });
    expect(list.json().addresses[0].lastUsedAt).not.toBeNull();
  });

  it('pelanggan dipilih + alamat baru diketik → tersimpan ke alamat pelanggan (dengan titik)', async () => {
    const r = await call(app, 'orderCreate', {
      cookie: kasir,
      body: {
        type: 'delivery',
        items: item(),
        customerId: tgCustomerId,
        delivery: { name: `Sokha ${tag}`, addressText: 'Victory Hill 5', lat: 10.63, lng: 103.5 },
      },
    });
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json().order).toMatchObject({ customer: { id: tgCustomerId }, address: { lat: 10.63 } });
    const list = await call(app, 'customerAddresses', { cookie: kasir, params: { id: tgCustomerId } });
    expect(list.json().addresses[0]).toMatchObject({ text: 'Victory Hill 5', lng: 103.5 });
  });

  it('alamat milik pelanggan lain / tanpa customerId ditolak; kontrak lama (delivery saja) tetap jalan', async () => {
    const [other] = await app.db
      .insert(customers)
      .values({ name: `Lain2 ${tag}` })
      .returning();
    const wrong = await call(app, 'orderCreate', {
      cookie: kasir,
      body: { type: 'delivery', items: item(), customerId: other!.id, addressId: firstId },
    });
    expect(wrong.statusCode).toBe(404);
    const noCustomer = await call(app, 'orderCreate', {
      cookie: kasir,
      body: { type: 'delivery', items: item(), addressId: firstId },
    });
    expect(noCustomer.statusCode).toBe(400);
    const legacy = await call(app, 'orderCreate', {
      cookie: kasir,
      body: { type: 'delivery', items: item(), delivery: { name: 'Lama', addressText: 'Jl. Lama 1' } },
    });
    expect(legacy.statusCode, legacy.body).toBe(200);
  });

  it('no HP sama diketik lagi → pelanggan yang sama (tidak dobel), alamat sama dipakai ulang', async () => {
    const phone = `0${(Date.now() % 1e8) + 1}`;
    const body = (n: string) => ({
      type: 'delivery' as const,
      items: item(),
      delivery: { name: n, phone, addressText: 'Jl. Dedi 7' },
    });
    const a = await call(app, 'orderCreate', { cookie: kasir, body: body(`Pak Dedi ${tag}`) });
    const b = await call(app, 'orderCreate', { cookie: kasir, body: body(`Pak Dedi ${tag}`) });
    expect(b.json().order.customer.id).toBe(a.json().order.customer.id);
    expect(b.json().order.address.id).toBe(a.json().order.address.id);
  });
});

describe('resolver link lokasi', () => {
  afterEach(() => vi.unstubAllGlobals());

  const redirect = (to: string, status = 302) => new Response(null, { status, headers: { location: to } });

  it('link pendek → ikuti redirect sampai ada titik', async () => {
    const seen: string[] = [];
    const fetchFn = (async (u: URL, init?: RequestInit) => {
      seen.push(String(u));
      expect(init?.redirect).toBe('manual');
      if (String(u).startsWith('https://maps.app.goo.gl/'))
        return redirect(
          'https://www.google.com/maps/place/Kfe/@10.6271,103.5221,17z/data=!3d10.6275!4d103.5225',
        );
      return new Response('x');
    }) as unknown as typeof fetch;
    const r = await resolveMapsLink('https://maps.app.goo.gl/AbCd123', { fetchFn });
    expect(r).toMatchObject({ lat: 10.6275, lng: 103.5225 });
    expect(seen).toEqual(['https://maps.app.goo.gl/AbCd123']);
  });

  it('link Maps dengan titik langsung → tanpa fetch; tanpa titik → url akhir & null', async () => {
    const never = (async () => {
      throw new Error('tidak boleh fetch');
    }) as unknown as typeof fetch;
    expect(
      await resolveMapsLink('https://maps.google.com/?q=10.61,103.52', { fetchFn: never }),
    ).toMatchObject({
      lat: 10.61,
      lng: 103.52,
    });
    const ok = (async () => new Response('<html>')) as unknown as typeof fetch;
    expect(await resolveMapsLink('https://maps.app.goo.gl/zzz', { fetchFn: ok })).toEqual({
      url: 'https://maps.app.goo.gl/zzz',
      lat: null,
      lng: null,
    });
  });

  it('host bukan Google ditolak (tanpa fetch), termasuk trik userinfo/port/subdomain', async () => {
    const fetchFn = vi.fn();
    for (const bad of [
      'https://evil.com/maps?q=1',
      'http://169.254.169.254/latest/meta-data',
      'https://maps.app.goo.gl.evil.com/x',
      'https://maps.app.goo.gl@evil.com/x',
      'https://maps.app.goo.gl:8443/x',
      'https://www.google.com/url?q=https://evil.com',
      'https://goo.gl/abc',
      'file:///etc/passwd',
    ]) {
      await expect(resolveMapsLink(bad, { fetchFn: fetchFn as never }), bad).rejects.toMatchObject({
        statusCode: 422,
        message: 'Link ini bukan link Google Maps',
      });
    }
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('redirect ke host lain tidak dibuka', async () => {
    const seen: string[] = [];
    const fetchFn = (async (u: URL) => {
      seen.push(String(u));
      return redirect('http://127.0.0.1:3000/admin');
    }) as unknown as typeof fetch;
    await expect(resolveMapsLink('https://maps.app.goo.gl/x', { fetchFn })).rejects.toMatchObject({
      message: 'Link ini bukan link Google Maps',
    });
    expect(seen).toHaveLength(1);
  });

  it('redirect dibatasi 5x', async () => {
    let n = 0;
    const fetchFn = (async () => {
      n++;
      return redirect(`https://maps.app.goo.gl/loop${n}`, 301);
    }) as unknown as typeof fetch;
    await expect(resolveMapsLink('https://maps.app.goo.gl/start', { fetchFn })).rejects.toMatchObject({
      message: 'Link dialihkan terlalu banyak kali',
    });
    expect(n).toBe(6);
  });

  it('endpoint staf: butuh order.create; fetch gagal → 422 pesan jelas', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('timeout');
      }),
    );
    expect(
      (await call(app, 'geoResolveLink', { cookie: dapur, body: { url: 'https://maps.app.goo.gl/a' } }))
        .statusCode,
    ).toBe(403);
    const r = await call(app, 'geoResolveLink', {
      cookie: kasir,
      body: { url: 'https://maps.app.goo.gl/a' },
    });
    expect(r.statusCode).toBe(422);
    expect(r.json().error.message).toBe('Link lokasi tidak bisa dibuka, coba lagi');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => redirect('https://www.google.com/maps/search/10.6,103.5')),
    );
    const ok = await call(app, 'geoResolveLink', {
      cookie: kasir,
      body: { url: 'https://maps.app.goo.gl/b' },
    });
    expect(ok.statusCode, ok.body).toBe(200);
    expect(ok.json()).toEqual({
      url: 'https://www.google.com/maps/search/10.6,103.5',
      lat: 10.6,
      lng: 103.5,
    });
  });
});
