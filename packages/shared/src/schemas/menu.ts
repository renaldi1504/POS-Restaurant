import { z } from 'zod';
import { Lang } from '../enums';
import { LocalizedLongText, LocalizedText } from '../localized';
import { Id, MoneyAmount, NonNegMoney } from './common';

export const CategoryDto = z.object({ id: Id, name: LocalizedText, sort: z.number().int() });
export type CategoryDto = z.infer<typeof CategoryDto>;

export const OptionDto = z.object({
  id: Id,
  groupId: Id,
  name: LocalizedText,
  /** Tambahan harga (boleh 0 atau negatif), mata uang utama. */
  priceDelta: MoneyAmount,
  available: z.boolean(),
  sort: z.number().int(),
});
export type OptionDto = z.infer<typeof OptionDto>;

export const OptionGroupDto = z.object({
  id: Id,
  name: LocalizedText,
  required: z.boolean(),
  minSelect: z.number().int().nonnegative(),
  /** 0 = tanpa batas. */
  maxSelect: z.number().int().nonnegative(),
  options: z.array(OptionDto),
});
export type OptionGroupDto = z.infer<typeof OptionGroupDto>;

/** Harga per channel; null = belum diatur (untuk grab/foodpanda → tidak dijual di platform). */
export const ItemPrices = z.object({
  store: NonNegMoney,
  grab: NonNegMoney.nullable(),
  foodpanda: NonNegMoney.nullable(),
});
export type ItemPrices = z.infer<typeof ItemPrices>;

/** Menu untuk staf (semua harga channel). */
export const MenuItemDto = z.object({
  id: Id,
  categoryId: Id,
  name: LocalizedText,
  description: LocalizedLongText,
  aiInfo: z.string(),
  photoUrl: z.string().nullable(),
  available: z.boolean(),
  bestSeller: z.boolean(),
  sort: z.number().int(),
  prices: ItemPrices,
  /** Grup opsi terpasang, urut sesuai `item_option_groups.sort`. */
  optionGroupIds: z.array(Id),
});
export type MenuItemDto = z.infer<typeof MenuItemDto>;

/** `GET /menu` (staf). */
export const StaffMenuResponse = z.object({
  categories: z.array(CategoryDto),
  items: z.array(MenuItemDto),
  optionGroups: z.array(OptionGroupDto),
});
export type StaffMenuResponse = z.infer<typeof StaffMenuResponse>;

/** Menu untuk pelanggan (harga store saja). */
export const PublicMenuItem = z.object({
  id: Id,
  categoryId: Id,
  name: LocalizedText,
  description: LocalizedLongText,
  photoUrl: z.string().nullable(),
  available: z.boolean(),
  bestSeller: z.boolean(),
  sort: z.number().int(),
  price: NonNegMoney,
  optionGroupIds: z.array(Id),
});
export type PublicMenuItem = z.infer<typeof PublicMenuItem>;

export const PublicCategory = CategoryDto.extend({ itemCount: z.number().int().nonnegative() });
export type PublicCategory = z.infer<typeof PublicCategory>;

export const PublicMenuQuery = z.object({ lang: Lang.optional() });
/** `GET /public/menu?lang=` — teks tetap dikirim lengkap 4 bahasa (pencarian lintas bahasa); klien memakai `tl()`. */
export const PublicMenuResponse = z.object({
  categories: z.array(PublicCategory),
  items: z.array(PublicMenuItem),
  optionGroups: z.array(OptionGroupDto),
});
export type PublicMenuResponse = z.infer<typeof PublicMenuResponse>;

/** `PATCH /menu/items/:id/availability` & `/menu/options/:id/availability`. */
export const AvailabilityRequest = z.object({ available: z.boolean() });
export type AvailabilityRequest = z.infer<typeof AvailabilityRequest>;
export const AvailabilityResponse = z.object({ id: Id, available: z.boolean() });
export type AvailabilityResponse = z.infer<typeof AvailabilityResponse>;

/** Snapshot opsi yang disimpan di order_items.options_snapshot. */
export const OptionSnapshot = z.object({
  groupId: Id.nullable(),
  optionId: Id.nullable(),
  groupName: LocalizedText,
  optionName: LocalizedText,
  priceDelta: MoneyAmount,
});
export type OptionSnapshot = z.infer<typeof OptionSnapshot>;
