/** Menu: DTO staf/publik, availability, CRUD admin (kategori, menu, harga, grup opsi, promo). */
import { and, asc, count, eq, inArray, sql } from 'drizzle-orm';
import type {
  AdminOptionGroupDto,
  CategoryDto,
  CreateItemRequest,
  MenuItemDto,
  OptionDto,
  OptionGroupDto,
  OptionInput,
  PromoDto,
  PublicMenuResponse,
  StaffMenuResponse,
  UpdateItemRequest,
} from '@pos/shared';
import { seq } from '../../lib/seq';
import type { DbOrTx } from '../../db/client';
import {
  categories,
  itemOptionGroups,
  itemPrices,
  menuItems,
  optionGroups,
  options,
  type promos,
} from '../../db/schema';
import { notFound, validationError } from '../../lib/errors';

type CategoryRow = typeof categories.$inferSelect;
type ItemRow = typeof menuItems.$inferSelect;
type GroupRow = typeof optionGroups.$inferSelect;
type OptionRow = typeof options.$inferSelect;
type PromoRow = typeof promos.$inferSelect;

export const toCategoryDto = (c: CategoryRow): CategoryDto => ({ id: c.id, name: c.name, sort: c.sort });

export const toOptionDto = (o: OptionRow): OptionDto => ({
  id: o.id,
  groupId: o.groupId,
  name: o.name,
  priceDelta: o.priceDelta,
  available: o.available,
  sort: o.sort,
});

export function toPromoDto(p: PromoRow): PromoDto {
  return {
    id: p.id,
    name: p.name,
    channel: p.channel ?? null,
    kind: p.kind,
    value: p.value,
    scope: p.scope ?? {},
    startsAt: p.startsAt?.toISOString() ?? null,
    endsAt: p.endsAt?.toISOString() ?? null,
    active: p.active,
  };
}

/** Muat menu item (+ harga + grup terpasang). */
export async function loadItems(db: DbOrTx, ids?: number[]): Promise<MenuItemDto[]> {
  if (ids && ids.length === 0) return [];
  const rows = await db
    .select()
    .from(menuItems)
    .where(ids ? inArray(menuItems.id, ids) : undefined)
    .orderBy(asc(menuItems.sort), asc(menuItems.id));
  if (!rows.length) return [];
  const itemIds = rows.map((r) => r.id);
  const [prices, links] = await seq(
    () => db.select().from(itemPrices).where(inArray(itemPrices.itemId, itemIds)),
    () =>
      db
        .select()
        .from(itemOptionGroups)
        .where(inArray(itemOptionGroups.itemId, itemIds))
        .orderBy(asc(itemOptionGroups.sort), asc(itemOptionGroups.groupId)),
  );
  return rows.map((r: ItemRow) => {
    const p = prices.filter((x) => x.itemId === r.id);
    const price = (ch: 'store' | 'grab' | 'foodpanda') => p.find((x) => x.channel === ch)?.price ?? null;
    return {
      id: r.id,
      categoryId: r.categoryId,
      name: r.name,
      description: r.description ?? {},
      aiInfo: r.aiInfo,
      photoUrl: r.photoUrl,
      available: r.available,
      bestSeller: r.bestSeller,
      sort: r.sort,
      prices: { store: price('store') ?? 0, grab: price('grab'), foodpanda: price('foodpanda') },
      optionGroupIds: links.filter((l) => l.itemId === r.id).map((l) => l.groupId),
    };
  });
}

export async function getItem(db: DbOrTx, id: number): Promise<MenuItemDto> {
  const [item] = await loadItems(db, [id]);
  if (!item) throw notFound('Menu tidak ditemukan');
  return item;
}

/** Grup opsi + pilihannya (urut sort). */
export async function loadOptionGroups(db: DbOrTx, ids?: number[]): Promise<OptionGroupDto[]> {
  if (ids && ids.length === 0) return [];
  const groups = await db
    .select()
    .from(optionGroups)
    .where(ids ? inArray(optionGroups.id, ids) : undefined)
    .orderBy(asc(optionGroups.id));
  if (!groups.length) return [];
  const opts = await db
    .select()
    .from(options)
    .where(
      inArray(
        options.groupId,
        groups.map((g) => g.id),
      ),
    )
    .orderBy(asc(options.sort), asc(options.id));
  return groups.map((g: GroupRow) => ({
    id: g.id,
    name: g.name,
    required: g.required,
    minSelect: g.minSelect,
    maxSelect: g.maxSelect,
    options: opts.filter((o) => o.groupId === g.id).map(toOptionDto),
  }));
}

export async function loadAdminOptionGroups(db: DbOrTx, ids?: number[]): Promise<AdminOptionGroupDto[]> {
  const groups = await loadOptionGroups(db, ids);
  if (!groups.length) return [];
  const links = await db
    .select()
    .from(itemOptionGroups)
    .where(
      inArray(
        itemOptionGroups.groupId,
        groups.map((g) => g.id),
      ),
    )
    .orderBy(asc(itemOptionGroups.itemId));
  return groups.map((g) => ({
    ...g,
    itemIds: links.filter((l) => l.groupId === g.id).map((l) => l.itemId),
  }));
}

export async function getAdminOptionGroup(db: DbOrTx, id: number): Promise<AdminOptionGroupDto> {
  const [g] = await loadAdminOptionGroups(db, [id]);
  if (!g) throw notFound('Grup pilihan tidak ditemukan');
  return g;
}

export async function listCategories(db: DbOrTx): Promise<CategoryDto[]> {
  const rows = await db.select().from(categories).orderBy(asc(categories.sort), asc(categories.id));
  return rows.map(toCategoryDto);
}

export async function staffMenu(db: DbOrTx): Promise<StaffMenuResponse> {
  const [cats, items, groups] = await seq(
    () => listCategories(db),
    () => loadItems(db),
    () => loadOptionGroups(db),
  );
  return { categories: cats, items, optionGroups: groups };
}

/** Menu pelanggan: harga store, tersedia dulu lalu habis, grup yang dipakai saja. */
export async function publicMenu(db: DbOrTx): Promise<PublicMenuResponse> {
  const [cats, items] = await seq(
    () => listCategories(db),
    () => loadItems(db),
  );
  const sorted = [...items].sort(
    (a, b) => Number(b.available) - Number(a.available) || a.sort - b.sort || a.id - b.id,
  );
  const groupIds = [...new Set(items.flatMap((i) => i.optionGroupIds))];
  const groups = await loadOptionGroups(db, groupIds);
  return {
    categories: cats.map((c) => ({ ...c, itemCount: items.filter((i) => i.categoryId === c.id).length })),
    items: sorted.map((i) => ({
      id: i.id,
      categoryId: i.categoryId,
      name: i.name,
      description: i.description,
      photoUrl: i.photoUrl,
      available: i.available,
      bestSeller: i.bestSeller,
      sort: i.sort,
      price: i.prices.store,
      optionGroupIds: i.optionGroupIds,
    })),
    optionGroups: groups,
  };
}

// ---------- Admin: menu item ----------
async function assertCategory(db: DbOrTx, id: number) {
  const [c] = await db.select({ id: categories.id }).from(categories).where(eq(categories.id, id));
  if (!c) throw validationError('Kategori tidak ditemukan', [{ path: ['categoryId'] }]);
}

async function assertGroups(db: DbOrTx, ids: number[]) {
  if (!ids.length) return;
  const rows = await db
    .select({ id: optionGroups.id })
    .from(optionGroups)
    .where(inArray(optionGroups.id, ids));
  if (rows.length !== new Set(ids).size) throw validationError('Grup pilihan tidak ditemukan');
}

async function setItemPrices(
  db: DbOrTx,
  itemId: number,
  prices: { store?: number; grab?: number | null; foodpanda?: number | null },
) {
  for (const ch of ['store', 'grab', 'foodpanda'] as const) {
    const v = prices[ch];
    if (v === undefined) continue;
    if (v === null) {
      await db.delete(itemPrices).where(and(eq(itemPrices.itemId, itemId), eq(itemPrices.channel, ch)));
    } else {
      await db
        .insert(itemPrices)
        .values({ itemId, channel: ch, price: v })
        .onConflictDoUpdate({ target: [itemPrices.itemId, itemPrices.channel], set: { price: v } });
    }
  }
}

async function setItemGroups(db: DbOrTx, itemId: number, groupIds: number[]) {
  const unique = [...new Set(groupIds)];
  await assertGroups(db, unique);
  await db.delete(itemOptionGroups).where(eq(itemOptionGroups.itemId, itemId));
  if (unique.length)
    await db.insert(itemOptionGroups).values(unique.map((groupId, sort) => ({ itemId, groupId, sort })));
}

export async function createItem(db: DbOrTx, body: CreateItemRequest): Promise<number> {
  await assertCategory(db, body.categoryId);
  const [row] = await db
    .insert(menuItems)
    .values({
      categoryId: body.categoryId,
      name: body.name,
      description: body.description ?? {},
      aiInfo: body.aiInfo ?? '',
      available: body.available ?? true,
      bestSeller: body.bestSeller ?? false,
      sort: body.sort ?? 0,
    })
    .returning({ id: menuItems.id });
  const id = row!.id;
  await setItemPrices(db, id, body.prices);
  if (body.optionGroupIds) await setItemGroups(db, id, body.optionGroupIds);
  return id;
}

export async function updateItem(db: DbOrTx, id: number, body: UpdateItemRequest): Promise<void> {
  await getItem(db, id);
  if (body.categoryId !== undefined) await assertCategory(db, body.categoryId);
  const set: Partial<typeof menuItems.$inferInsert> = {};
  if (body.categoryId !== undefined) set.categoryId = body.categoryId;
  if (body.name !== undefined) set.name = body.name;
  if (body.description !== undefined) set.description = body.description;
  if (body.aiInfo !== undefined) set.aiInfo = body.aiInfo;
  if (body.available !== undefined) set.available = body.available;
  if (body.bestSeller !== undefined) set.bestSeller = body.bestSeller;
  if (body.sort !== undefined) set.sort = body.sort;
  if (body.photoUrl !== undefined) set.photoUrl = body.photoUrl;
  await db
    .update(menuItems)
    .set({ ...set, updatedAt: sql`now()` })
    .where(eq(menuItems.id, id));
  if (body.prices) await setItemPrices(db, id, body.prices);
  if (body.optionGroupIds) await setItemGroups(db, id, body.optionGroupIds);
}

// ---------- Admin: grup opsi ----------
/** Ganti daftar pilihan grup: id lama dipertahankan/diubah, baru ditambah, yang tidak dikirim dihapus. */
export async function replaceGroupOptions(db: DbOrTx, groupId: number, input: OptionInput[]) {
  const existing = await db.select({ id: options.id }).from(options).where(eq(options.groupId, groupId));
  const existingIds = new Set(existing.map((e) => e.id));
  const keep = new Set<number>();
  for (const [i, o] of input.entries()) {
    const values = {
      name: o.name,
      priceDelta: o.priceDelta ?? 0,
      available: o.available ?? true,
      sort: o.sort ?? i,
    };
    if (o.id !== undefined) {
      if (!existingIds.has(o.id)) throw validationError(`Pilihan ${o.id} bukan milik grup ini`);
      keep.add(o.id);
      await db.update(options).set(values).where(eq(options.id, o.id));
    } else {
      await db.insert(options).values({ groupId, ...values });
    }
  }
  const remove = [...existingIds].filter((id) => !keep.has(id));
  if (remove.length) await db.delete(options).where(inArray(options.id, remove));
}

/** Set menu yang memakai grup (sort = di akhir daftar grup item). */
export async function setGroupItems(db: DbOrTx, groupId: number, itemIds: number[]) {
  const unique = [...new Set(itemIds)];
  if (unique.length) {
    const found = await db.select({ id: menuItems.id }).from(menuItems).where(inArray(menuItems.id, unique));
    if (found.length !== unique.length) throw validationError('Menu tidak ditemukan');
  }
  const current = await db
    .select({ itemId: itemOptionGroups.itemId })
    .from(itemOptionGroups)
    .where(eq(itemOptionGroups.groupId, groupId));
  const currentIds = new Set(current.map((c) => c.itemId));
  const toRemove = [...currentIds].filter((id) => !unique.includes(id));
  if (toRemove.length)
    await db
      .delete(itemOptionGroups)
      .where(and(eq(itemOptionGroups.groupId, groupId), inArray(itemOptionGroups.itemId, toRemove)));
  for (const itemId of unique) {
    if (currentIds.has(itemId)) continue;
    const [{ n } = { n: 0 }] = await db
      .select({ n: count() })
      .from(itemOptionGroups)
      .where(eq(itemOptionGroups.itemId, itemId));
    await db.insert(itemOptionGroups).values({ itemId, groupId, sort: n });
  }
}
