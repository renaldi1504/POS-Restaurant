/** Fixture bersama untuk test integrasi (DB pos_test dipakai berurutan oleh semua file). */
import { eq, isNull, sql } from 'drizzle-orm';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { expect } from 'vitest';
import type { SettingsPatch } from '@pos/shared';
import { dineTables, menuItems, options, shifts } from '../src/db/schema';
import { clock } from '../src/lib/clock';
import { patchSettings } from '../src/lib/settings';
import { call, cookieHeader } from './helpers';

/** Tutup semua shift terbuka langsung di DB (isolasi antar file). */
export async function closeAllShifts(app: FastifyInstance) {
  await app.db
    .update(shifts)
    .set({ closedAt: sql`now()` })
    .where(isNull(shifts.closedAt));
}

export async function openShift(
  app: FastifyInstance,
  cookie: string,
  openingCash: { KHR?: number; USD?: number; IDR?: number } = { KHR: 100_000 },
) {
  const res = await call(app, 'shiftOpen', {
    cookie,
    body: { name: 'Pagi', openingCash: { KHR: 0, USD: 0, IDR: 0, ...openingCash } },
  });
  expect(res.statusCode, res.body).toBe(200);
  return res.json().shift as { id: number; businessDate: string };
}

/** Restoran buka 24 jam (supaya test order publik tidak tergantung jam). */
export async function open24h(app: FastifyInstance) {
  await patchSettings(app.db, { hours: { open: '00:00', close: '00:00' } });
}

export async function resetSettings(app: FastifyInstance, extra: SettingsPatch = {}) {
  await patchSettings(app.db, {
    hours: { open: '08:00', close: '03:00', holidays: [] },
    qr: { requireAccept: true },
    delivery: { minOrder: 0, defaultFee: 0 },
    currency: { main: 'KHR', enabled: ['KHR', 'USD', 'IDR'], rates: { USD: 4100, IDR: 0.25 } },
    ...extra,
  });
  clock.reset();
}

export interface MenuIds {
  item: (name: string) => number;
  option: (name: string) => number;
}

export async function menuIds(app: FastifyInstance): Promise<MenuIds> {
  const items = await app.db.select({ id: menuItems.id, name: menuItems.name }).from(menuItems);
  const opts = await app.db.select({ id: options.id, name: options.name }).from(options);
  return {
    item: (n) => {
      const x = items.find((i) => i.name.id === n);
      if (!x) throw new Error(`item ${n}`);
      return x.id;
    },
    option: (n) => {
      const x = opts.find((i) => i.name.id === n);
      if (!x) throw new Error(`option ${n}`);
      return x.id;
    },
  };
}

export async function tableByName(app: FastifyInstance, name: string) {
  const [t] = await app.db.select().from(dineTables).where(eq(dineTables.name, name));
  if (!t) throw new Error(`meja ${name}`);
  return t;
}

/** Order kasir takeaway sederhana. */
export async function createSimpleOrder(
  app: FastifyInstance,
  cookie: string,
  ids: MenuIds,
  body: Record<string, unknown> = {},
) {
  const res = await call(app, 'orderCreate', {
    cookie,
    body: { type: 'takeaway', items: [{ itemId: ids.item('Nasi Putih'), qty: 1 }], ...body },
  });
  expect(res.statusCode, res.body).toBe(200);
  return res.json().order as { id: string; total: number; number: number; status: string; displayNo: string };
}

/** Body multipart sederhana dengan satu file. */
export function multipart(
  filename: string,
  contentType: string,
  data: Buffer,
): { payload: Buffer; headers: Record<string, string> } {
  const boundary = '----postest' + Math.random().toString(16).slice(2);
  const head = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`,
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  return {
    payload: Buffer.concat([head, data, tail]),
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
  };
}

/** PNG 1×1. */
export const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

/** Gabungkan cookie (mis. cookie pelanggan baru dari respons). */
export function mergeCookies(prev: string | undefined, res: LightMyRequestResponse): string {
  const map = new Map<string, string>();
  for (const part of (prev ?? '')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean)) {
    const [k, ...v] = part.split('=');
    map.set(k!, v.join('='));
  }
  for (const c of res.cookies) map.set(c.name, c.value);
  return [...map.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}

export { cookieHeader };
