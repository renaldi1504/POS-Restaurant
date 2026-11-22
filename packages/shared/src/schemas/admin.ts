import { z } from 'zod';
import { Lang, OrderChannel, PromoKind } from '../enums';
import { LocalizedLongText, LocalizedText } from '../localized';
import { PermissionKey, PermissionList } from '../permissions';
import { Id, IsoDateTime, IsoDateTimeInput, MoneyAmount, NonNegMoney, Pin } from './common';
import { CategoryDto, MenuItemDto, OptionDto, OptionGroupDto } from './menu';
import { ExpenseCategoryDto } from './shifts';

// ---------- Kategori ----------
export const CategoriesResponse = z.object({ categories: z.array(CategoryDto) });
export type CategoriesResponse = z.infer<typeof CategoriesResponse>;
export const CategoryResponse = z.object({ category: CategoryDto });
export type CategoryResponse = z.infer<typeof CategoryResponse>;
export const CreateCategoryRequest = z.object({ name: LocalizedText, sort: z.number().int().optional() });
export type CreateCategoryRequest = z.infer<typeof CreateCategoryRequest>;
export const UpdateCategoryRequest = z.object({
  name: LocalizedText.optional(),
  sort: z.number().int().optional(),
});
export type UpdateCategoryRequest = z.infer<typeof UpdateCategoryRequest>;

/** Urutan baru: id dari atas ke bawah (sort = posisi). Id yang tidak disebut tidak berubah. */
export const ReorderRequest = z.object({ ids: z.array(Id).min(1).max(1000) });
export type ReorderRequest = z.infer<typeof ReorderRequest>;

// ---------- Menu item ----------
export const ItemPricesInput = z.object({
  store: NonNegMoney,
  grab: NonNegMoney.nullable().optional(),
  foodpanda: NonNegMoney.nullable().optional(),
});
export const CreateItemRequest = z.object({
  categoryId: Id,
  name: LocalizedText,
  description: LocalizedLongText.optional(),
  aiInfo: z.string().max(2000).optional(),
  available: z.boolean().optional(),
  bestSeller: z.boolean().optional(),
  sort: z.number().int().optional(),
  prices: ItemPricesInput,
  /** Urutan = urutan tampil di lembar opsi. */
  optionGroupIds: z.array(Id).optional(),
});
export type CreateItemRequest = z.infer<typeof CreateItemRequest>;
export const UpdateItemRequest = z.object({
  categoryId: Id.optional(),
  name: LocalizedText.optional(),
  description: LocalizedLongText.optional(),
  aiInfo: z.string().max(2000).optional(),
  available: z.boolean().optional(),
  bestSeller: z.boolean().optional(),
  sort: z.number().int().optional(),
  prices: ItemPricesInput.partial().optional(),
  optionGroupIds: z.array(Id).optional(),
  /** null = hapus foto. */
  photoUrl: z.string().nullable().optional(),
});
export type UpdateItemRequest = z.infer<typeof UpdateItemRequest>;
export const ItemsResponse = z.object({ items: z.array(MenuItemDto) });
export type ItemsResponse = z.infer<typeof ItemsResponse>;
export const ItemResponse = z.object({ item: MenuItemDto });
export type ItemResponse = z.infer<typeof ItemResponse>;

// ---------- Grup opsi ----------
export const OptionInput = z.object({
  /** Ada = ubah pilihan lama; kosong = pilihan baru. Pilihan lama yang tidak dikirim akan dihapus. */
  id: Id.optional(),
  name: LocalizedText,
  priceDelta: MoneyAmount.default(0),
  /** Tambahan harga Grab / foodpanda; null/kosong = sama dengan harga toko. */
  priceGrab: MoneyAmount.nullable().optional(),
  priceFoodpanda: MoneyAmount.nullable().optional(),
  available: z.boolean().default(true),
  sort: z.number().int().optional(),
});
export type OptionInput = z.input<typeof OptionInput>;
export const CreateOptionGroupRequest = z
  .object({
    name: LocalizedText,
    required: z.boolean(),
    minSelect: z.number().int().min(0).max(20),
    maxSelect: z.number().int().min(0).max(20),
    options: z.array(OptionInput).max(50).default([]),
    /** Pasang langsung ke menu-menu ini. */
    itemIds: z.array(Id).optional(),
  })
  .refine((v) => v.maxSelect === 0 || v.maxSelect >= v.minSelect, {
    message: 'Maksimal harus ≥ minimal',
    path: ['maxSelect'],
  });
export type CreateOptionGroupRequest = z.input<typeof CreateOptionGroupRequest>;
export const UpdateOptionGroupRequest = z.object({
  name: LocalizedText.optional(),
  required: z.boolean().optional(),
  minSelect: z.number().int().min(0).max(20).optional(),
  maxSelect: z.number().int().min(0).max(20).optional(),
  /** Bila dikirim: daftar lengkap pilihan (replace, id lama dipertahankan). */
  options: z.array(OptionInput).max(50).optional(),
});
export type UpdateOptionGroupRequest = z.input<typeof UpdateOptionGroupRequest>;
/** Grup + daftar menu yang memakainya. */
export const AdminOptionGroupDto = OptionGroupDto.extend({ itemIds: z.array(Id) });
export type AdminOptionGroupDto = z.infer<typeof AdminOptionGroupDto>;
export const OptionGroupsResponse = z.object({ optionGroups: z.array(AdminOptionGroupDto) });
export type OptionGroupsResponse = z.infer<typeof OptionGroupsResponse>;
export const OptionGroupResponse = z.object({ optionGroup: AdminOptionGroupDto });
export type OptionGroupResponse = z.infer<typeof OptionGroupResponse>;
/** `PUT /admin/option-groups/:id/items` — set daftar menu yang memakai grup ini. */
export const AttachOptionGroupRequest = z.object({ itemIds: z.array(Id) });
export type AttachOptionGroupRequest = z.infer<typeof AttachOptionGroupRequest>;
/** `POST /admin/option-groups/:id/options` & `PATCH /admin/options/:id`. */
export const CreateOptionRequest = OptionInput.omit({ id: true });
export type CreateOptionRequest = z.input<typeof CreateOptionRequest>;
export const UpdateOptionRequest = z.object({
  name: LocalizedText.optional(),
  priceDelta: MoneyAmount.optional(),
  priceGrab: MoneyAmount.nullable().optional(),
  priceFoodpanda: MoneyAmount.nullable().optional(),
  available: z.boolean().optional(),
  sort: z.number().int().optional(),
});
export type UpdateOptionRequest = z.infer<typeof UpdateOptionRequest>;
export const OptionResponse = z.object({ option: OptionDto });
export type OptionResponse = z.infer<typeof OptionResponse>;

// ---------- Promo ----------
export const PromoScope = z.object({
  /** Kosong semua = berlaku untuk seluruh order. */
  itemIds: z.array(Id).optional(),
  categoryIds: z.array(Id).optional(),
  /** Minimal subtotal (mata uang utama). */
  minSubtotal: NonNegMoney.optional(),
});
export type PromoScope = z.infer<typeof PromoScope>;
export const PromoDto = z.object({
  id: Id,
  name: z.string(),
  /** null = semua channel. */
  channel: OrderChannel.nullable(),
  kind: PromoKind,
  /** pct: 0–100; amount: minor mata uang utama. */
  value: z.number().nonnegative(),
  scope: PromoScope,
  startsAt: IsoDateTime.nullable(),
  endsAt: IsoDateTime.nullable(),
  active: z.boolean(),
});
export type PromoDto = z.infer<typeof PromoDto>;
export const CreatePromoRequest = z.object({
  name: z.string().trim().min(1).max(100),
  channel: OrderChannel.nullable().default(null),
  kind: PromoKind,
  value: z.number().nonnegative(),
  scope: PromoScope.default({}),
  startsAt: IsoDateTimeInput.nullable().optional(),
  endsAt: IsoDateTimeInput.nullable().optional(),
  active: z.boolean().default(true),
});
export type CreatePromoRequest = z.input<typeof CreatePromoRequest>;
export const UpdatePromoRequest = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  channel: OrderChannel.nullable().optional(),
  kind: PromoKind.optional(),
  value: z.number().nonnegative().optional(),
  scope: PromoScope.optional(),
  startsAt: IsoDateTimeInput.nullable().optional(),
  endsAt: IsoDateTimeInput.nullable().optional(),
  active: z.boolean().optional(),
});
export type UpdatePromoRequest = z.infer<typeof UpdatePromoRequest>;
export const PromosResponse = z.object({ promos: z.array(PromoDto) });
export type PromosResponse = z.infer<typeof PromosResponse>;
export const PromoResponse = z.object({ promo: PromoDto });
export type PromoResponse = z.infer<typeof PromoResponse>;

// ---------- Terjemahan otomatis ----------
/** `POST /admin/translate` — isi bahasa yang kosong dari teks `id` (Gemini; mode mock bila key kosong). */
const TranslateText = z.object({
  id: z.string().trim().min(1).max(1000),
  en: z.string().max(1000).optional(),
  kh: z.string().max(1000).optional(),
  zh: z.string().max(1000).optional(),
});
export const TranslateRequest = z.object({
  entries: z
    .array(
      z.object({
        key: z.string().min(1).max(100),
        /** Nama (≤200) atau deskripsi (≤1000 karakter). */
        text: TranslateText,
        /** Juga timpa bahasa yang sudah terisi. */
        overwrite: z.boolean().default(false),
      }),
    )
    .min(1)
    .max(50),
  targets: z.array(Lang).optional(),
});
export type TranslateRequest = z.input<typeof TranslateRequest>;
export const TranslateResponse = z.object({
  entries: z.array(z.object({ key: z.string(), text: TranslateText })),
  /** gemini = AI; free = MyMemory gratis; none = gagal (kolom dibiarkan kosong); mock = test/dev offline. */
  provider: z.enum(['gemini', 'free', 'mock', 'none']),
});
export type TranslateResponse = z.infer<typeof TranslateResponse>;

// ---------- Pengguna & role ----------
export const AdminUserDto = z.object({
  id: Id,
  name: z.string(),
  role: z.object({ id: Id, name: z.string() }),
  lang: Lang,
  active: z.boolean(),
  /** User sistem (Bot Telegram) — tidak bisa login/diubah PIN. */
  system: z.boolean(),
  lockedUntil: IsoDateTime.nullable(),
  failedAttempts: z.number().int(),
});
export type AdminUserDto = z.infer<typeof AdminUserDto>;
export const UsersResponse = z.object({ users: z.array(AdminUserDto) });
export type UsersResponse = z.infer<typeof UsersResponse>;
export const UserResponse = z.object({ user: AdminUserDto });
export type UserResponse = z.infer<typeof UserResponse>;
export const CreateUserRequest = z.object({
  name: z.string().trim().min(1).max(50),
  roleId: Id,
  pin: Pin,
  lang: Lang.default('id'),
  active: z.boolean().default(true),
});
export type CreateUserRequest = z.input<typeof CreateUserRequest>;
export const UpdateUserRequest = z.object({
  name: z.string().trim().min(1).max(50).optional(),
  roleId: Id.optional(),
  pin: Pin.optional(),
  lang: Lang.optional(),
  active: z.boolean().optional(),
  /** true = buka kunci PIN. */
  unlock: z.boolean().optional(),
});
export type UpdateUserRequest = z.infer<typeof UpdateUserRequest>;

export const RoleDto = z.object({
  id: Id,
  name: z.string(),
  permissions: PermissionList,
  system: z.boolean(),
  userCount: z.number().int().nonnegative(),
});
export type RoleDto = z.infer<typeof RoleDto>;
export const RolesResponse = z.object({ roles: z.array(RoleDto) });
export type RolesResponse = z.infer<typeof RolesResponse>;
export const RoleResponse = z.object({ role: RoleDto });
export type RoleResponse = z.infer<typeof RoleResponse>;
export const CreateRoleRequest = z.object({
  name: z.string().trim().min(1).max(50),
  permissions: z.array(PermissionKey),
});
export type CreateRoleRequest = z.infer<typeof CreateRoleRequest>;
export const UpdateRoleRequest = z.object({
  name: z.string().trim().min(1).max(50).optional(),
  permissions: z.array(PermissionKey).optional(),
});
export type UpdateRoleRequest = z.infer<typeof UpdateRoleRequest>;

// ---------- Kategori pengeluaran (admin) ----------
export const CreateExpenseCategoryRequest = z.object({ name: z.string().trim().min(1).max(50) });
export type CreateExpenseCategoryRequest = z.infer<typeof CreateExpenseCategoryRequest>;
export const UpdateExpenseCategoryRequest = CreateExpenseCategoryRequest.partial();
export type UpdateExpenseCategoryRequest = z.infer<typeof UpdateExpenseCategoryRequest>;
export const ExpenseCategoryResponse = z.object({ category: ExpenseCategoryDto });
export type ExpenseCategoryResponse = z.infer<typeof ExpenseCategoryResponse>;

// ---------- Audit log ----------
export const AuditLogDto = z.object({
  id: Id,
  user: z.object({ id: Id, name: z.string() }).nullable(),
  action: z.string(),
  entity: z.string(),
  entityId: z.string().nullable(),
  before: z.unknown().nullable(),
  after: z.unknown().nullable(),
  reason: z.string().nullable(),
  createdAt: IsoDateTime,
});
export type AuditLogDto = z.infer<typeof AuditLogDto>;
export const AuditLogsQuery = z.object({
  entity: z.string().optional(),
  entityId: z.string().optional(),
  userId: z.coerce.number().int().positive().optional(),
  action: z.string().optional(),
  from: IsoDateTimeInput.optional(),
  to: IsoDateTimeInput.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  /** Kursor: ambil log dengan id < before. */
  before: z.coerce.number().int().positive().optional(),
});
export type AuditLogsQuery = z.input<typeof AuditLogsQuery>;
export const AuditLogsResponse = z.object({
  logs: z.array(AuditLogDto),
  nextCursor: z.number().int().nullable(),
});
export type AuditLogsResponse = z.infer<typeof AuditLogsResponse>;

// ---------- Tes AI (diagnosa bot) ----------
export const AiTestRequest = z.object({ question: z.string().trim().min(1).max(500) });
export type AiTestRequest = z.infer<typeof AiTestRequest>;
export const AiTestResponse = z.object({
  keySet: z.boolean(),
  aiEnabled: z.boolean(),
  model: z.string(),
  /** ok | unsure | quota | disabled | error | lookup */
  reason: z.string(),
  lang: z.string(),
  answer: z.string(),
  forwarded: z.boolean(),
  /** Pesan error asli dari Gemini (untuk diagnosa), null bila sukses. */
  error: z.string().nullable(),
});
export type AiTestResponse = z.infer<typeof AiTestResponse>;
