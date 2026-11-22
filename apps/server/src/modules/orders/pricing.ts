/**
 * Hitung harga order dari DB (harga channel + delta opsi). Harga dari klien TIDAK pernah dipakai.
 */
import { and, asc, eq, inArray } from 'drizzle-orm';
import {
  computeLineTotal,
  percentOf,
  priceChannelFor,
  validateOptionSelection,
  type LocalizedText,
  type ManualDiscount,
  type OptionSnapshot,
  type OrderChannel,
} from '@pos/shared';
import type { DbOrTx } from '../../db/client';
import { itemOptionGroups, itemPrices, menuItems, optionGroups, options, promos } from '../../db/schema';
import { unprocessable } from '../../lib/errors';

export interface ItemInput {
  itemId: number;
  qty: number;
  optionIds: number[];
  note?: string | undefined;
}

export interface PricedLine {
  itemId: number;
  categoryId: number;
  name: LocalizedText;
  qty: number;
  unitPrice: number;
  options: OptionSnapshot[];
  lineTotal: number;
  note: string | null;
}

export async function priceItems(
  db: DbOrTx,
  channel: OrderChannel,
  input: ItemInput[],
): Promise<PricedLine[]> {
  const priceChannel = priceChannelFor(channel);
  const itemIds = [...new Set(input.map((i) => i.itemId))];
  const rows = await db
    .select({
      id: menuItems.id,
      categoryId: menuItems.categoryId,
      name: menuItems.name,
      available: menuItems.available,
      price: itemPrices.price,
    })
    .from(menuItems)
    .leftJoin(itemPrices, and(eq(itemPrices.itemId, menuItems.id), eq(itemPrices.channel, priceChannel)))
    .where(inArray(menuItems.id, itemIds));
  const links = await db
    .select({
      itemId: itemOptionGroups.itemId,
      groupId: itemOptionGroups.groupId,
      sort: itemOptionGroups.sort,
    })
    .from(itemOptionGroups)
    .where(inArray(itemOptionGroups.itemId, itemIds))
    .orderBy(asc(itemOptionGroups.sort));
  const groupIds = [...new Set(links.map((l) => l.groupId))];
  const groups = groupIds.length
    ? await db.select().from(optionGroups).where(inArray(optionGroups.id, groupIds))
    : [];
  const opts = groupIds.length
    ? await db
        .select()
        .from(options)
        .where(inArray(options.groupId, groupIds))
        .orderBy(asc(options.sort), asc(options.id))
    : [];

  return input.map((line, index) => {
    const item = rows.find((r) => r.id === line.itemId);
    if (!item || !item.available || item.price === null || item.price === undefined) {
      throw unprocessable(
        'ITEM_UNAVAILABLE',
        item ? `${item.name.id} sedang habis` : 'Menu tidak ditemukan',
        {
          itemId: line.itemId,
          index,
        },
      );
    }
    const itemGroups = links
      .filter((l) => l.itemId === item.id)
      .map((l) => groups.find((g) => g.id === l.groupId)!)
      .filter(Boolean)
      .map((g) => ({
        ...g,
        // Harga pilihan mengikuti channel (Grab/foodpanda punya harga sendiri; kosong = harga toko).
        options: opts
          .filter((o) => o.groupId === g.id)
          .map((o) => ({
            ...o,
            priceDelta:
              priceChannel === 'grab'
                ? (o.priceGrab ?? o.priceDelta)
                : priceChannel === 'foodpanda'
                  ? (o.priceFoodpanda ?? o.priceDelta)
                  : o.priceDelta,
          })),
      }));
    const result = validateOptionSelection(itemGroups, line.optionIds);
    if (!result.ok) {
      throw unprocessable('OPTION_INVALID', `Pilihan untuk ${item.name.id} belum benar`, {
        itemId: item.id,
        index,
        errors: result.errors,
      });
    }
    // Snapshot urut sesuai urutan grup & pilihan.
    const snapshot: OptionSnapshot[] = [];
    for (const g of itemGroups) {
      for (const o of g.options) {
        if (!line.optionIds.includes(o.id)) continue;
        snapshot.push({
          groupId: g.id,
          optionId: o.id,
          groupName: g.name,
          optionName: o.name,
          priceDelta: o.priceDelta,
        });
      }
    }
    return {
      itemId: item.id,
      categoryId: item.categoryId,
      name: item.name,
      qty: line.qty,
      unitPrice: item.price,
      options: snapshot,
      lineTotal: computeLineTotal(item.price, result.priceDelta, line.qty),
      note: line.note?.trim() || null,
    };
  });
}

export interface DiscountResult {
  discount: number;
  promoId: number | null;
}

/** Potongan promo tersimpan + potongan manual (dibatasi ≤ subtotal). */
export async function computeDiscount(
  db: DbOrTx,
  args: {
    lines: PricedLine[];
    channel: OrderChannel;
    promoId?: number | null | undefined;
    manual?: ManualDiscount | null | undefined;
    at: Date;
  },
): Promise<DiscountResult> {
  const subtotal = args.lines.reduce((a, l) => a + l.lineTotal, 0);
  let discount = 0;
  let promoId: number | null = null;
  if (args.promoId) {
    const [p] = await db.select().from(promos).where(eq(promos.id, args.promoId));
    const t = args.at.getTime();
    const valid =
      p &&
      p.active &&
      (!p.channel || p.channel === args.channel) &&
      (!p.startsAt || p.startsAt.getTime() <= t) &&
      (!p.endsAt || p.endsAt.getTime() > t);
    if (!p || !valid) throw unprocessable('BAD_REQUEST', 'Promo tidak berlaku untuk order ini');
    const scope = p.scope ?? {};
    if (scope.minSubtotal && subtotal < scope.minSubtotal)
      throw unprocessable('BAD_REQUEST', 'Belum mencapai minimal belanja promo');
    const scoped = !!(scope.itemIds?.length || scope.categoryIds?.length);
    const base = scoped
      ? args.lines
          .filter((l) => scope.itemIds?.includes(l.itemId) || scope.categoryIds?.includes(l.categoryId))
          .reduce((a, l) => a + l.lineTotal, 0)
      : subtotal;
    if (base <= 0) throw unprocessable('BAD_REQUEST', 'Promo tidak berlaku untuk menu yang dipesan');
    discount +=
      p.kind === 'pct' ? percentOf(base, Math.min(100, p.value)) : Math.min(Math.round(p.value), base);
    promoId = p.id;
  }
  if (args.manual) {
    discount +=
      args.manual.kind === 'pct'
        ? percentOf(subtotal, Math.min(100, args.manual.value))
        : Math.round(args.manual.value);
  }
  return { discount: Math.min(discount, subtotal), promoId };
}
