import { count, eq, inArray } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { MenuAvailabilityPayload } from '@pos/shared';
import { categories, menuItems, optionGroups, options, promos } from '../../db/schema';
import { writeAudit } from '../../lib/audit';
import { now } from '../../lib/clock';
import { badRequest, conflict, notFound, validationError } from '../../lib/errors';
import { defineRoute } from '../../lib/route';
import { readImageUpload } from '../../lib/upload';
import {
  createItem,
  getAdminOptionGroup,
  getItem,
  listCategories,
  loadAdminOptionGroups,
  loadItems,
  publicMenu,
  replaceGroupOptions,
  setGroupItems,
  staffMenu,
  toCategoryDto,
  toOptionDto,
  toPromoDto,
  updateItem,
} from './service';

/** Kirim `menu.availability` ke semua socket (staf & pelanggan). */
export function broadcastAvailability(app: FastifyInstance, p: Omit<MenuAvailabilityPayload, 'at'>) {
  const payload: MenuAvailabilityPayload = { ...p, at: now().toISOString() };
  (app.realtime.io as unknown as { emit: (e: string, x: unknown) => void }).emit(
    'menu.availability',
    payload,
  );
}

/** Set `sort` = posisi (1, 2, 3…) untuk id yang diberikan, dalam satu transaksi. */
async function applyOrder(
  app: FastifyInstance,
  table: typeof categories | typeof menuItems,
  ids: number[],
): Promise<void> {
  if (new Set(ids).size !== ids.length) throw badRequest('Urutan berisi id ganda');
  await app.db.transaction(async (tx) => {
    const found = await tx.select({ id: table.id }).from(table).where(inArray(table.id, ids));
    if (found.length !== ids.length) throw notFound('Sebagian data tidak ditemukan');
    for (const [i, id] of ids.entries()) {
      await tx
        .update(table)
        .set({ sort: i + 1 })
        .where(eq(table.id, id));
    }
  });
}

export default async function menuRoutes(app: FastifyInstance) {
  // ---------- Staf ----------
  defineRoute(app, 'menuStaff', async () => staffMenu(app.db));
  defineRoute(app, 'publicMenu', async () => publicMenu(app.db));

  defineRoute(app, 'menuItemAvailability', async ({ params, body, staff }) => {
    const [row] = await app.db
      .update(menuItems)
      .set({ available: body.available, updatedAt: now() })
      .where(eq(menuItems.id, params.id))
      .returning({ id: menuItems.id, available: menuItems.available });
    if (!row) throw notFound('Menu tidak ditemukan');
    await writeAudit(app.db, {
      userId: staff.id,
      action: 'menu.availability',
      entity: 'menu_item',
      entityId: row.id,
      after: { available: row.available },
    });
    broadcastAvailability(app, { kind: 'item', id: row.id, available: row.available });
    return row;
  });

  defineRoute(app, 'menuOptionAvailability', async ({ params, body, staff }) => {
    const [row] = await app.db
      .update(options)
      .set({ available: body.available })
      .where(eq(options.id, params.id))
      .returning({ id: options.id, available: options.available });
    if (!row) throw notFound('Pilihan tidak ditemukan');
    await writeAudit(app.db, {
      userId: staff.id,
      action: 'menu.option_availability',
      entity: 'option',
      entityId: row.id,
      after: { available: row.available },
    });
    broadcastAvailability(app, { kind: 'option', id: row.id, available: row.available });
    return row;
  });

  // ---------- Admin: kategori ----------
  defineRoute(app, 'adminCategoriesList', async () => ({ categories: await listCategories(app.db) }));

  defineRoute(app, 'adminCategoryCreate', async ({ body, staff }) => {
    const [row] = await app.db
      .insert(categories)
      .values({ name: body.name, sort: body.sort ?? 0 })
      .returning();
    await writeAudit(app.db, {
      userId: staff.id,
      action: 'category.create',
      entity: 'category',
      entityId: row!.id,
      after: row,
    });
    return { category: toCategoryDto(row!) };
  });

  defineRoute(app, 'adminCategoryUpdate', async ({ params, body, staff }) => {
    const set: Partial<typeof categories.$inferInsert> = {};
    if (body.name !== undefined) set.name = body.name;
    if (body.sort !== undefined) set.sort = body.sort;
    const [before] = await app.db.select().from(categories).where(eq(categories.id, params.id));
    if (!before) throw notFound('Kategori tidak ditemukan');
    const [row] = Object.keys(set).length
      ? await app.db.update(categories).set(set).where(eq(categories.id, params.id)).returning()
      : [before];
    await writeAudit(app.db, {
      userId: staff.id,
      action: 'category.update',
      entity: 'category',
      entityId: params.id,
      before,
      after: row,
    });
    return { category: toCategoryDto(row!) };
  });

  defineRoute(app, 'adminCategoryDelete', async ({ params, staff }) => {
    const [{ n } = { n: 0 }] = await app.db
      .select({ n: count() })
      .from(menuItems)
      .where(eq(menuItems.categoryId, params.id));
    if (n > 0) throw conflict('CONFLICT', 'Kategori masih berisi menu');
    const [row] = await app.db.delete(categories).where(eq(categories.id, params.id)).returning();
    if (!row) throw notFound('Kategori tidak ditemukan');
    await writeAudit(app.db, {
      userId: staff.id,
      action: 'category.delete',
      entity: 'category',
      entityId: params.id,
      before: row,
    });
    return { ok: true as const };
  });

  defineRoute(app, 'adminCategoriesReorder', async ({ body, staff }) => {
    await applyOrder(app, categories, body.ids);
    await writeAudit(app.db, {
      userId: staff.id,
      action: 'category.reorder',
      entity: 'category',
      after: { ids: body.ids },
    });
    return { ok: true as const };
  });

  defineRoute(app, 'adminItemsReorder', async ({ body, staff }) => {
    await applyOrder(app, menuItems, body.ids);
    await writeAudit(app.db, {
      userId: staff.id,
      action: 'menu.reorder',
      entity: 'menu_item',
      after: { ids: body.ids },
    });
    return { ok: true as const };
  });

  // ---------- Admin: menu ----------
  defineRoute(app, 'adminItemsList', async () => ({ items: await loadItems(app.db) }));
  defineRoute(app, 'adminItemGet', async ({ params }) => ({ item: await getItem(app.db, params.id) }));

  defineRoute(app, 'adminItemCreate', async ({ body, staff }) => {
    const id = await app.db.transaction(async (tx) => {
      const id = await createItem(tx, body);
      await writeAudit(tx, {
        userId: staff.id,
        action: 'item.create',
        entity: 'menu_item',
        entityId: id,
        after: body,
      });
      return id;
    });
    return { item: await getItem(app.db, id) };
  });

  defineRoute(app, 'adminItemUpdate', async ({ params, body, staff }) => {
    const before = await getItem(app.db, params.id);
    await app.db.transaction(async (tx) => {
      await updateItem(tx, params.id, body);
      await writeAudit(tx, {
        userId: staff.id,
        action: 'item.update',
        entity: 'menu_item',
        entityId: params.id,
        before,
        after: body,
      });
    });
    const item = await getItem(app.db, params.id);
    if (body.available !== undefined && body.available !== before.available)
      broadcastAvailability(app, { kind: 'item', id: item.id, available: item.available });
    return { item };
  });

  defineRoute(app, 'adminItemDelete', async ({ params, staff }) => {
    const before = await getItem(app.db, params.id);
    await app.db.delete(menuItems).where(eq(menuItems.id, params.id));
    await writeAudit(app.db, {
      userId: staff.id,
      action: 'item.delete',
      entity: 'menu_item',
      entityId: params.id,
      before,
    });
    return { ok: true as const };
  });

  defineRoute(app, 'adminItemPhoto', async ({ params, req, staff }) => {
    await getItem(app.db, params.id);
    const file = await readImageUpload(req);
    const saved = await app.storage.save({ ...file, visibility: 'public', folder: 'menu' });
    await app.db
      .update(menuItems)
      .set({ photoUrl: saved.url, updatedAt: now() })
      .where(eq(menuItems.id, params.id));
    await writeAudit(app.db, {
      userId: staff.id,
      action: 'item.photo',
      entity: 'menu_item',
      entityId: params.id,
      after: { photoUrl: saved.url },
    });
    return { item: await getItem(app.db, params.id) };
  });

  // ---------- Admin: grup opsi ----------
  defineRoute(app, 'adminOptionGroupsList', async () => ({
    optionGroups: await loadAdminOptionGroups(app.db),
  }));

  defineRoute(app, 'adminOptionGroupCreate', async ({ body, staff }) => {
    const id = await app.db.transaction(async (tx) => {
      const [g] = await tx
        .insert(optionGroups)
        .values({
          name: body.name,
          required: body.required,
          minSelect: body.minSelect,
          maxSelect: body.maxSelect,
        })
        .returning({ id: optionGroups.id });
      await replaceGroupOptions(tx, g!.id, body.options);
      if (body.itemIds) await setGroupItems(tx, g!.id, body.itemIds);
      await writeAudit(tx, {
        userId: staff.id,
        action: 'option_group.create',
        entity: 'option_group',
        entityId: g!.id,
        after: body,
      });
      return g!.id;
    });
    return { optionGroup: await getAdminOptionGroup(app.db, id) };
  });

  defineRoute(app, 'adminOptionGroupUpdate', async ({ params, body, staff }) => {
    const before = await getAdminOptionGroup(app.db, params.id);
    const minSelect = body.minSelect ?? before.minSelect;
    const maxSelect = body.maxSelect ?? before.maxSelect;
    if (maxSelect !== 0 && maxSelect < minSelect)
      throw validationError('Maksimal harus ≥ minimal', [{ path: ['maxSelect'] }]);
    await app.db.transaction(async (tx) => {
      const set: Partial<typeof optionGroups.$inferInsert> = {};
      if (body.name !== undefined) set.name = body.name;
      if (body.required !== undefined) set.required = body.required;
      if (body.minSelect !== undefined) set.minSelect = body.minSelect;
      if (body.maxSelect !== undefined) set.maxSelect = body.maxSelect;
      if (Object.keys(set).length)
        await tx.update(optionGroups).set(set).where(eq(optionGroups.id, params.id));
      if (body.options) await replaceGroupOptions(tx, params.id, body.options);
      await writeAudit(tx, {
        userId: staff.id,
        action: 'option_group.update',
        entity: 'option_group',
        entityId: params.id,
        before,
        after: body,
      });
    });
    return { optionGroup: await getAdminOptionGroup(app.db, params.id) };
  });

  defineRoute(app, 'adminOptionGroupDelete', async ({ params, staff }) => {
    const before = await getAdminOptionGroup(app.db, params.id);
    await app.db.delete(optionGroups).where(eq(optionGroups.id, params.id));
    await writeAudit(app.db, {
      userId: staff.id,
      action: 'option_group.delete',
      entity: 'option_group',
      entityId: params.id,
      before,
    });
    return { ok: true as const };
  });

  defineRoute(app, 'adminOptionGroupAttach', async ({ params, body, staff }) => {
    await getAdminOptionGroup(app.db, params.id);
    await app.db.transaction(async (tx) => {
      await setGroupItems(tx, params.id, body.itemIds);
      await writeAudit(tx, {
        userId: staff.id,
        action: 'option_group.attach',
        entity: 'option_group',
        entityId: params.id,
        after: body,
      });
    });
    return { optionGroup: await getAdminOptionGroup(app.db, params.id) };
  });

  defineRoute(app, 'adminOptionCreate', async ({ params, body, staff }) => {
    await getAdminOptionGroup(app.db, params.id);
    const [{ n } = { n: 0 }] = await app.db
      .select({ n: count() })
      .from(options)
      .where(eq(options.groupId, params.id));
    const [row] = await app.db
      .insert(options)
      .values({
        groupId: params.id,
        name: body.name,
        priceDelta: body.priceDelta ?? 0,
        available: body.available ?? true,
        sort: body.sort ?? n,
      })
      .returning();
    await writeAudit(app.db, {
      userId: staff.id,
      action: 'option.create',
      entity: 'option',
      entityId: row!.id,
      after: row,
    });
    return { option: toOptionDto(row!) };
  });

  defineRoute(app, 'adminOptionUpdate', async ({ params, body, staff }) => {
    const [before] = await app.db.select().from(options).where(eq(options.id, params.id));
    if (!before) throw notFound('Pilihan tidak ditemukan');
    const set: Partial<typeof options.$inferInsert> = {};
    if (body.name !== undefined) set.name = body.name;
    if (body.priceDelta !== undefined) set.priceDelta = body.priceDelta;
    if (body.available !== undefined) set.available = body.available;
    if (body.sort !== undefined) set.sort = body.sort;
    const [row] = Object.keys(set).length
      ? await app.db.update(options).set(set).where(eq(options.id, params.id)).returning()
      : [before];
    await writeAudit(app.db, {
      userId: staff.id,
      action: 'option.update',
      entity: 'option',
      entityId: params.id,
      before,
      after: row,
    });
    if (body.available !== undefined && body.available !== before.available)
      broadcastAvailability(app, { kind: 'option', id: params.id, available: body.available });
    return { option: toOptionDto(row!) };
  });

  defineRoute(app, 'adminOptionDelete', async ({ params, staff }) => {
    const [row] = await app.db.delete(options).where(eq(options.id, params.id)).returning();
    if (!row) throw notFound('Pilihan tidak ditemukan');
    await writeAudit(app.db, {
      userId: staff.id,
      action: 'option.delete',
      entity: 'option',
      entityId: params.id,
      before: row,
    });
    return { ok: true as const };
  });

  // ---------- Admin: promo ----------
  defineRoute(app, 'adminPromosList', async () => {
    const rows = await app.db.select().from(promos).orderBy(promos.id);
    return { promos: rows.map(toPromoDto) };
  });

  defineRoute(app, 'adminPromoCreate', async ({ body, staff }) => {
    if (body.kind === 'pct' && body.value > 100) throw validationError('Persen maksimal 100');
    const [row] = await app.db
      .insert(promos)
      .values({
        name: body.name,
        channel: body.channel,
        kind: body.kind,
        value: body.value,
        scope: body.scope,
        startsAt: body.startsAt ? new Date(body.startsAt) : null,
        endsAt: body.endsAt ? new Date(body.endsAt) : null,
        active: body.active,
      })
      .returning();
    await writeAudit(app.db, {
      userId: staff.id,
      action: 'promo.create',
      entity: 'promo',
      entityId: row!.id,
      after: row,
    });
    return { promo: toPromoDto(row!) };
  });

  defineRoute(app, 'adminPromoUpdate', async ({ params, body, staff }) => {
    const [before] = await app.db.select().from(promos).where(eq(promos.id, params.id));
    if (!before) throw notFound('Promo tidak ditemukan');
    const kind = body.kind ?? before.kind;
    const value = body.value ?? before.value;
    if (kind === 'pct' && value > 100) throw validationError('Persen maksimal 100');
    const set: Partial<typeof promos.$inferInsert> = {};
    if (body.name !== undefined) set.name = body.name;
    if (body.channel !== undefined) set.channel = body.channel;
    if (body.kind !== undefined) set.kind = body.kind;
    if (body.value !== undefined) set.value = body.value;
    if (body.scope !== undefined) set.scope = body.scope;
    if (body.startsAt !== undefined) set.startsAt = body.startsAt ? new Date(body.startsAt) : null;
    if (body.endsAt !== undefined) set.endsAt = body.endsAt ? new Date(body.endsAt) : null;
    if (body.active !== undefined) set.active = body.active;
    const [row] = Object.keys(set).length
      ? await app.db.update(promos).set(set).where(eq(promos.id, params.id)).returning()
      : [before];
    await writeAudit(app.db, {
      userId: staff.id,
      action: 'promo.update',
      entity: 'promo',
      entityId: params.id,
      before,
      after: row,
    });
    return { promo: toPromoDto(row!) };
  });

  defineRoute(app, 'adminPromoDelete', async ({ params, staff }) => {
    const [before] = await app.db.select().from(promos).where(eq(promos.id, params.id));
    if (!before) throw notFound('Promo tidak ditemukan');
    // Promo yang sudah dipakai order: nonaktifkan saja (FK orders.promo_id).
    try {
      await app.db.delete(promos).where(eq(promos.id, params.id));
    } catch {
      await app.db.update(promos).set({ active: false }).where(eq(promos.id, params.id));
    }
    await writeAudit(app.db, {
      userId: staff.id,
      action: 'promo.delete',
      entity: 'promo',
      entityId: params.id,
      before,
    });
    return { ok: true as const };
  });
}
