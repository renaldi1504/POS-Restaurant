/**
 * Pelanggan untuk kasir: cari (nama / @username / no HP), alamat tersimpan (terakhir dipakai dulu),
 * simpan alamat baru tanpa duplikat.
 */
import { and, desc, eq, ilike, inArray, isNotNull, max, or, sql } from 'drizzle-orm';
import type { CustomerRef, CustomerSearchItem, StaffAddressDto } from '@pos/shared';
import type { DbOrTx } from '../../db/client';
import { addresses, customers, orders } from '../../db/schema';
import { notFound } from '../../lib/errors';

type AddressRow = typeof addresses.$inferSelect;
type CustomerRow = typeof customers.$inferSelect;

export const toCustomerRef = (c: CustomerRow): CustomerRef => ({
  id: c.id,
  name: c.name,
  username: c.username,
  phone: c.phone,
  telegramId: c.telegramId,
});

const iso = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString() : null);

export const toStaffAddressDto = (
  a: AddressRow,
  lastUsedAt: Date | string | null = null,
): StaffAddressDto => ({
  id: a.id,
  label: a.label,
  text: a.text,
  landmark: a.landmark,
  lat: a.lat,
  lng: a.lng,
  lastUsedAt: iso(lastUsedAt),
});

/** Escape `%`, `_`, `\` untuk ILIKE. */
const likeEscape = (s: string) => s.replace(/[\\%_]/g, (m) => `\\${m}`);

const sameText = (a: string | null | undefined, b: string | null | undefined) =>
  (a ?? '').trim().toLowerCase().replace(/\s+/g, ' ') === (b ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
const samePoint = (a: number | null | undefined, b: number | null | undefined) =>
  a == null || b == null ? a == null && b == null : Math.abs(a - b) < 1e-5;

/**
 * Alamat tersimpan per pelanggan, urut terakhir dipakai order (atau dibuat) → yang pertama = alamat utama.
 * Alamat kembar (teks, patokan & titik sama — sisa order lama) ditampilkan sekali.
 */
export async function addressesByCustomer(
  db: DbOrTx,
  customerIds: number[],
): Promise<Map<number, StaffAddressDto[]>> {
  const out = new Map<number, StaffAddressDto[]>();
  if (!customerIds.length) return out;
  const rows = await db
    .select({ a: addresses, lastUsed: max(orders.createdAt) })
    .from(addresses)
    .leftJoin(orders, eq(orders.addressId, addresses.id))
    .where(inArray(addresses.customerId, customerIds))
    .groupBy(addresses.id);
  const sorted = rows
    .map((r) => ({ ...r, at: new Date(r.lastUsed ?? r.a.createdAt).getTime() }))
    .sort((x, y) => y.at - x.at || y.a.id - x.a.id);
  for (const r of sorted) {
    const list = out.get(r.a.customerId!) ?? [];
    const dup = list.some(
      (d) =>
        sameText(d.text, r.a.text) &&
        sameText(d.landmark, r.a.landmark) &&
        samePoint(d.lat, r.a.lat) &&
        samePoint(d.lng, r.a.lng),
    );
    if (!dup) list.push(toStaffAddressDto(r.a, r.lastUsed));
    out.set(r.a.customerId!, list);
  }
  return out;
}

export async function searchCustomers(db: DbOrTx, q: string, limit = 20): Promise<CustomerSearchItem[]> {
  const term = q.trim();
  const plain = term.replace(/^@/, '');
  const pat = `%${likeEscape(plain)}%`;
  const digits = term.replace(/\D/g, '');
  const conds = [ilike(customers.name, pat), ilike(customers.username, pat), ilike(customers.phone, pat)];
  // No HP: cocokkan angka saja ("012 345 678" = "012345678"); minimal 3 angka.
  if (digits.length >= 3 && /^[\d\s+().-]+$/.test(term))
    conds.push(sql`regexp_replace(coalesce(${customers.phone}, ''), '\\D', '', 'g') like ${`%${digits}%`}`);
  const stats = db
    .select({
      customerId: orders.customerId,
      orderCount: sql<number>`count(*)::int`.as('order_count'),
      lastOrderAt: max(orders.createdAt).as('last_order_at'),
    })
    .from(orders)
    .where(isNotNull(orders.customerId))
    .groupBy(orders.customerId)
    .as('stats');
  const rows = await db
    .select({ c: customers, orderCount: stats.orderCount, lastOrderAt: stats.lastOrderAt })
    .from(customers)
    .leftJoin(stats, eq(stats.customerId, customers.id))
    .where(or(...conds))
    .orderBy(sql`${stats.lastOrderAt} desc nulls last`, desc(customers.id))
    .limit(limit);
  const addrs = await addressesByCustomer(
    db,
    rows.map((r) => r.c.id),
  );
  return rows.map((r) => {
    const list = addrs.get(r.c.id) ?? [];
    return {
      ...toCustomerRef(r.c),
      lastAddress: list[0] ?? null,
      addressCount: list.length,
      orderCount: r.orderCount ?? 0,
      lastOrderAt: iso(r.lastOrderAt),
    };
  });
}

export async function requireCustomer(db: DbOrTx, id: number): Promise<CustomerRow> {
  const [c] = await db.select().from(customers).where(eq(customers.id, id));
  if (!c) throw notFound('Pelanggan tidak ditemukan');
  return c;
}

export async function requireCustomerAddress(
  db: DbOrTx,
  customerId: number,
  id: number,
): Promise<AddressRow> {
  const [a] = await db
    .select()
    .from(addresses)
    .where(and(eq(addresses.id, id), eq(addresses.customerId, customerId)));
  if (!a) throw notFound('Alamat tidak ditemukan');
  return a;
}

export interface AddressInput {
  label?: string | undefined;
  text: string;
  landmark?: string | null | undefined;
  lat?: number | null | undefined;
  lng?: number | null | undefined;
}

/**
 * Simpan alamat pelanggan; alamat yang sama persis (teks + patokan + titik) dipakai ulang supaya daftar
 * alamat tidak penuh duplikat. Tanpa pelanggan → alamat lepas (seperti order lama).
 */
export async function saveCustomerAddress(
  db: DbOrTx,
  customerId: number | null,
  d: AddressInput,
  defaultLabel = 'Alamat',
): Promise<AddressRow> {
  if (customerId) {
    const existing = await db.select().from(addresses).where(eq(addresses.customerId, customerId));
    const hit = existing.find(
      (a) =>
        sameText(a.text, d.text) &&
        sameText(a.landmark, d.landmark) &&
        samePoint(a.lat, d.lat ?? null) &&
        samePoint(a.lng, d.lng ?? null),
    );
    if (hit) return hit;
  }
  const [row] = await db
    .insert(addresses)
    .values({
      customerId,
      label: d.label?.trim() || defaultLabel,
      text: d.text.trim(),
      landmark: d.landmark?.trim() || null,
      lat: d.lat ?? null,
      lng: d.lng ?? null,
    })
    .returning();
  return row!;
}
