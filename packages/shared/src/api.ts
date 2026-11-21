/**
 * REGISTRI KONTRAK API — satu sumber untuk server (route + validasi + guard) dan klien (typed fetch).
 *
 * Setiap endpoint: method, path (lengkap dengan prefix), auth, permission, schema params/query/body/response.
 * - Server: `defineRoute(app, 'orderCreate', handler)` (apps/server/src/lib/route.ts) memakai entri ini.
 * - Klien:  `api.call('orderCreate', { body })` (packages/shared/src/client.ts).
 */
import { z } from 'zod';
import type { PermissionKey } from './permissions';
import * as A from './schemas/admin';
import * as Au from './schemas/auth';
import { IdParam, OkResponse, UuidParam } from './schemas/common';
import * as D from './schemas/drivers';
import * as M from './schemas/menu';
import * as O from './schemas/orders';
import * as Pay from './schemas/payments';
import * as P from './schemas/public';
import * as R from './schemas/reports';
import * as Cfg from './schemas/settings';
import * as S from './schemas/shifts';
import * as Sys from './schemas/system';
import * as T from './schemas/tables';

export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

/**
 * - `none`: publik
 * - `staff`: cookie sesi staf (`pos_sid`) wajib
 * - `customer`: cookie sesi pelanggan (`pos_cust`) wajib (telegram / meja / tamu)
 * - `customer_optional`: sesi pelanggan dibaca bila ada
 */
export type AuthKind = 'none' | 'staff' | 'customer' | 'customer_optional';

export interface EndpointDef {
  method: HttpMethod;
  path: string;
  auth: AuthKind;
  /** Staf harus punya SALAH SATU permission ini (kosong = cukup login). */
  permission?: readonly PermissionKey[];
  params?: z.ZodType;
  query?: z.ZodType;
  body?: z.ZodType;
  /** Body dikirim sebagai multipart/form-data dengan field file `file`. */
  multipart?: boolean;
  /** Schema respons JSON, atau 'binary' (mis. PDF). */
  response: z.ZodType | 'binary';
  /** Rate limit khusus (permintaan per menit per IP). */
  rateLimitPerMin?: number;
  description: string;
}

const def = <E extends EndpointDef>(e: E): E => e;

const staff = (...permission: PermissionKey[]) =>
  ({ auth: 'staff', ...(permission.length ? { permission } : {}) }) as const;

export const endpoints = {
  // ================= Sistem =================
  health: def({
    method: 'GET',
    path: '/api/health',
    auth: 'none',
    response: Sys.HealthResponse,
    description: 'Cek kesehatan server & DB',
  }),
  telegramWebhook: def({
    method: 'POST',
    path: '/tg/webhook',
    auth: 'none',
    body: Sys.TelegramUpdate,
    response: OkResponse,
    description: 'Webhook bot Telegram (header X-Telegram-Bot-Api-Secret-Token wajib cocok)',
  }),

  // ================= Auth staf =================
  authUsers: def({
    method: 'GET',
    path: '/api/auth/users',
    auth: 'none',
    response: Au.AuthUsersResponse,
    description: 'Daftar kartu login (user aktif, bukan sistem)',
  }),
  authPin: def({
    method: 'POST',
    path: '/api/auth/pin',
    auth: 'none',
    body: Au.PinLoginRequest,
    response: Au.PinLoginResponse,
    rateLimitPerMin: 30,
    description: 'Login PIN; 5x salah → kunci 5 menit (PIN_LOCKED)',
  }),
  authLogout: def({
    method: 'POST',
    path: '/api/auth/logout',
    auth: 'none',
    response: OkResponse,
    description: 'Hapus sesi staf',
  }),
  authMe: def({
    method: 'GET',
    path: '/api/auth/me',
    auth: 'staff',
    response: Au.MeResponse,
    description: 'User staf yang sedang login',
  }),
  authMeLang: def({
    method: 'PATCH',
    path: '/api/auth/me/lang',
    auth: 'staff',
    body: Au.MeLangRequest,
    response: Au.MeResponse,
    description: 'Simpan bahasa tampilan user yang sedang login (semua staf, tanpa izin khusus)',
  }),

  staffSettings: def({
    method: 'GET',
    path: '/api/settings/staff',
    auth: 'staff',
    response: Cfg.StaffSettingsResponse,
    description: 'Settings yang dibaca semua staf (ukuran teks, dapur, shift, komisi)',
  }),

  // ================= Pelanggan (publik) =================
  publicSessionTelegram: def({
    method: 'POST',
    path: '/api/public/session/telegram',
    auth: 'none',
    body: P.TelegramSessionRequest,
    response: P.CustomerSessionResponse,
    rateLimitPerMin: 30,
    description: 'Login otomatis Mini App (validasi HMAC initData, max 24 jam)',
  }),
  publicSessionTable: def({
    method: 'POST',
    path: '/api/public/session/table',
    auth: 'none',
    body: P.TableSessionRequest,
    response: P.CustomerSessionResponse,
    rateLimitPerMin: 30,
    description: 'Sesi mode meja dari QR',
  }),
  publicSession: def({
    method: 'GET',
    path: '/api/public/session',
    auth: 'customer_optional',
    response: P.CustomerSessionResponse,
    description: 'Sesi pelanggan saat ini (mode none bila belum ada)',
  }),
  publicSessionUpdate: def({
    method: 'PATCH',
    path: '/api/public/session',
    auth: 'customer',
    body: P.UpdateCustomerRequest,
    response: P.CustomerSessionResponse,
    description: 'Ubah nama/no HP/bahasa pelanggan',
  }),
  publicSessionEnd: def({
    method: 'DELETE',
    path: '/api/public/session',
    auth: 'customer_optional',
    response: OkResponse,
    description: 'Hapus sesi pelanggan',
  }),
  publicSettings: def({
    method: 'GET',
    path: '/api/public/settings',
    auth: 'none',
    response: Cfg.PublicSettingsResponse,
    description: 'Nama, logo, jam buka, status buka, mata uang',
  }),
  publicReverseGeocode: def({
    method: 'GET',
    path: '/api/public/geocode',
    auth: 'none',
    query: P.ReverseGeocodeQuery,
    response: P.ReverseGeocodeResponse,
    description: 'Alamat lengkap dari titik GPS (Google Geocoding bila ada key, lainnya OpenStreetMap)',
  }),
  publicMenu: def({
    method: 'GET',
    path: '/api/public/menu',
    auth: 'none',
    query: M.PublicMenuQuery,
    response: M.PublicMenuResponse,
    description: 'Menu pelanggan (harga store)',
  }),
  publicOrderCreate: def({
    method: 'POST',
    path: '/api/public/orders',
    auth: 'customer_optional',
    body: P.PublicCreateOrderRequest,
    response: P.PublicOrderResponse,
    rateLimitPerMin: 10,
    description:
      'Buat order online; tanpa sesi → server membuat sesi tamu (cookie) agar status bisa dipantau',
  }),
  publicOrdersMine: def({
    method: 'GET',
    path: '/api/public/orders',
    auth: 'customer',
    response: z.object({ orders: z.array(O.PublicOrderDto) }),
    description: 'Order terbaru milik pelanggan (status pesanan)',
  }),
  publicOrderGet: def({
    method: 'GET',
    path: '/api/public/orders/:id',
    auth: 'customer',
    params: UuidParam,
    response: P.PublicOrderResponse,
    description: 'Status order milik sesi pelanggan',
  }),
  publicOrderProof: def({
    method: 'POST',
    path: '/api/public/orders/:id/proof',
    auth: 'customer',
    params: UuidParam,
    multipart: true,
    response: P.PublicOrderResponse,
    rateLimitPerMin: 10,
    description: 'Upload bukti ABA (field file) → pending_verification + kirim ke grup admin',
  }),
  publicTableBill: def({
    method: 'GET',
    path: '/api/public/table/bill',
    auth: 'customer',
    response: P.PublicTableBillResponse,
    description: 'Tagihan berjalan meja (mode meja)',
  }),
  publicTableBillRequest: def({
    method: 'POST',
    path: '/api/public/table/bill-request',
    auth: 'customer',
    response: P.BillRequestResponse,
    description: 'Pelanggan minta bill',
  }),
  publicAddressesList: def({
    method: 'GET',
    path: '/api/public/addresses',
    auth: 'customer',
    response: P.AddressesResponse,
    description: 'Alamat tersimpan pelanggan',
  }),
  publicAddressCreate: def({
    method: 'POST',
    path: '/api/public/addresses',
    auth: 'customer',
    body: P.CreateAddressRequest,
    response: P.AddressResponse,
    description: 'Tambah alamat',
  }),
  publicAddressUpdate: def({
    method: 'PATCH',
    path: '/api/public/addresses/:id',
    auth: 'customer',
    params: IdParam,
    body: P.UpdateAddressRequest,
    response: P.AddressResponse,
    description: 'Ubah alamat',
  }),
  publicAddressDelete: def({
    method: 'DELETE',
    path: '/api/public/addresses/:id',
    auth: 'customer',
    params: IdParam,
    response: OkResponse,
    description: 'Hapus alamat',
  }),

  // ================= Staf: order =================
  ordersList: def({
    method: 'GET',
    path: '/api/orders',
    ...staff('order.create', 'order.accept', 'kitchen.view'),
    query: O.ListOrdersQuery,
    response: O.ListOrdersResponse,
    description: 'Daftar order (filter status/date/since)',
  }),
  orderGet: def({
    method: 'GET',
    path: '/api/orders/:id',
    ...staff('order.create', 'order.accept', 'kitchen.view', 'driver.deliver'),
    params: UuidParam,
    response: O.OrderResponse,
    description: 'Detail order',
  }),
  orderCreate: def({
    method: 'POST',
    path: '/api/orders',
    ...staff('order.create'),
    body: O.CreateOrderRequest,
    response: O.OrderResponse,
    description: 'Order kasir/Grab/foodpanda (wajib shift terbuka)',
  }),
  orderUpdate: def({
    method: 'PATCH',
    path: '/api/orders/:id',
    ...staff('order.create'),
    params: UuidParam,
    body: O.UpdateOrderRequest,
    response: O.OrderResponse,
    description: 'Edit order sebelum dibayar',
  }),
  orderAccept: def({
    method: 'POST',
    path: '/api/orders/:id/accept',
    ...staff('order.accept'),
    params: UuidParam,
    body: O.AcceptOrderRequest,
    response: O.OrderResponse,
    description: 'Terima order online/QR',
  }),
  orderReject: def({
    method: 'POST',
    path: '/api/orders/:id/reject',
    ...staff('order.accept'),
    params: UuidParam,
    body: O.RejectOrderRequest,
    response: O.OrderResponse,
    description: 'Tolak order online/QR dengan alasan',
  }),
  orderStatus: def({
    method: 'POST',
    path: '/api/orders/:id/status',
    ...staff('kitchen.update', 'order.create'),
    params: UuidParam,
    body: O.OrderStatusRequest,
    response: O.OrderResponse,
    description: 'Transisi status (transitionOrder)',
  }),
  orderCancel: def({
    method: 'POST',
    path: '/api/orders/:id/cancel',
    ...staff('order.create'),
    params: UuidParam,
    body: O.CancelOrderRequest,
    response: O.OrderResponse,
    description: 'Batalkan; setelah bayar butuh PIN admin + alasan',
  }),

  // ================= Staf: meja =================
  tablesList: def({
    method: 'GET',
    path: '/api/tables',
    ...staff('order.create'),
    response: T.TablesResponse,
    description: 'Denah meja dengan status',
  }),
  tableSession: def({
    method: 'GET',
    path: '/api/tables/:id/session',
    ...staff('order.create'),
    params: IdParam,
    response: T.TableBillDto,
    description: 'Tagihan meja (sesi terbuka)',
  }),
  tableOpen: def({
    method: 'POST',
    path: '/api/tables/:id/open',
    ...staff('order.create'),
    params: IdParam,
    response: T.TableSessionResponse,
    description: 'Buka sesi meja',
  }),
  tableMove: def({
    method: 'POST',
    path: '/api/tables/:id/move',
    ...staff('order.create'),
    params: IdParam,
    body: T.MoveTableRequest,
    response: T.TableSessionResponse,
    description: 'Pindah meja',
  }),
  tablesMerge: def({
    method: 'POST',
    path: '/api/tables/merge',
    ...staff('order.create'),
    body: T.MergeTablesRequest,
    response: T.TableSessionResponse,
    description: 'Gabung meja (from → to)',
  }),

  // ================= Staf: pembayaran =================
  paymentCreate: def({
    method: 'POST',
    path: '/api/payments',
    ...staff('payment.create'),
    body: Pay.CreatePaymentRequest,
    response: Pay.CreatePaymentResponse,
    description: 'Bayar order / sesi meja (split = banyak baris)',
  }),
  paymentVerify: def({
    method: 'POST',
    path: '/api/payments/:id/verify',
    ...staff('payment.create'),
    params: IdParam,
    body: Pay.VerifyPaymentRequest,
    response: Pay.VerifyPaymentResponse,
    description: 'Verifikasi bukti ABA',
  }),

  // ================= Staf: driver =================
  driverAvailable: def({
    method: 'GET',
    path: '/api/driver/available',
    ...staff('driver.deliver'),
    response: D.DriverAvailableResponse,
    description: 'Siap diantar',
  }),
  driverMine: def({
    method: 'GET',
    path: '/api/driver/mine',
    ...staff('driver.deliver'),
    response: D.DriverMineResponse,
    description: 'Antaran saya',
  }),
  driverTake: def({
    method: 'POST',
    path: '/api/driver/orders/:id/take',
    ...staff('driver.deliver'),
    params: UuidParam,
    response: D.DriverOrderResponse,
    description: 'Ambil order (atomic; ALREADY_TAKEN bila keduluan)',
  }),
  driverPicked: def({
    method: 'POST',
    path: '/api/driver/orders/:id/picked',
    ...staff('driver.deliver'),
    params: UuidParam,
    response: D.DriverOrderResponse,
    description: 'Sudah diambil dari dapur → picked_up',
  }),
  driverDelivered: def({
    method: 'POST',
    path: '/api/driver/orders/:id/delivered',
    ...staff('driver.deliver'),
    params: UuidParam,
    body: D.DriverDeliveredRequest,
    response: D.DriverOrderResponse,
    description: 'Sudah sampai → delivered (+ cash ditagih)',
  }),
  driverRelease: def({
    method: 'POST',
    path: '/api/driver/orders/:id/release',
    ...staff('driver.deliver', 'settings.manage'),
    params: UuidParam,
    body: D.DriverReleaseRequest,
    response: D.DriverOrderResponse,
    description: 'Lepas order (admin: pindah ke driver lain)',
  }),

  // ================= Staf: shift, pengeluaran, closing =================
  shiftOpen: def({
    method: 'POST',
    path: '/api/shifts/open',
    ...staff('shift.manage'),
    body: S.OpenShiftRequest,
    response: S.ShiftResponse,
    description: 'Buka shift (SHIFT_ALREADY_OPEN bila masih ada)',
  }),
  shiftCurrent: def({
    method: 'GET',
    path: '/api/shifts/current',
    ...staff(),
    response: S.CurrentShiftResponse,
    description: 'Shift terbuka saat ini',
  }),
  expensesList: def({
    method: 'GET',
    path: '/api/expenses',
    ...staff('shift.manage'),
    query: S.ListExpensesQuery,
    response: S.ExpensesResponse,
    description: 'Pengeluaran (default shift berjalan)',
  }),
  expenseCreate: def({
    method: 'POST',
    path: '/api/expenses',
    ...staff('shift.manage'),
    body: S.CreateExpenseRequest,
    response: S.ExpenseResponse,
    description: 'Catat pengeluaran',
  }),
  expensePhoto: def({
    method: 'POST',
    path: '/api/expenses/photo',
    ...staff('shift.manage'),
    multipart: true,
    response: S.UploadResponse,
    description: 'Upload foto nota pengeluaran → url',
  }),
  expenseCategories: def({
    method: 'GET',
    path: '/api/expense-categories',
    ...staff('shift.manage'),
    response: S.ExpenseCategoriesResponse,
    description: 'Kategori pengeluaran',
  }),
  closingPreview: def({
    method: 'GET',
    path: '/api/closing/preview',
    ...staff('shift.manage'),
    query: S.ClosingPreviewQuery,
    response: S.ClosingPreview,
    description: 'Hitungan seharusnya sebelum closing',
  }),
  closingCreate: def({
    method: 'POST',
    path: '/api/closing',
    ...staff('shift.manage'),
    body: S.CreateClosingRequest,
    response: S.ClosingResult,
    description: 'Closing shift (selisih ≠ 0 wajib catatan)',
  }),
  driverSettlementSettle: def({
    method: 'POST',
    path: '/api/driver-settlements/:id/settle',
    ...staff('shift.manage'),
    params: IdParam,
    response: S.DriverSettlementResponse,
    description: 'Tandai driver sudah setor',
  }),

  // ================= Staf: menu =================
  menuStaff: def({
    method: 'GET',
    path: '/api/menu',
    ...staff(),
    response: M.StaffMenuResponse,
    description: 'Menu staf (semua harga channel)',
  }),
  menuItemAvailability: def({
    method: 'PATCH',
    path: '/api/menu/items/:id/availability',
    ...staff('menu.toggle_available'),
    params: IdParam,
    body: M.AvailabilityRequest,
    response: M.AvailabilityResponse,
    description: 'Toggle Tersedia/Habis menu → menu.availability',
  }),
  menuOptionAvailability: def({
    method: 'PATCH',
    path: '/api/menu/options/:id/availability',
    ...staff('menu.toggle_available'),
    params: IdParam,
    body: M.AvailabilityRequest,
    response: M.AvailabilityResponse,
    description: 'Toggle Tersedia/Habis pilihan opsi',
  }),

  // ================= Admin: menu =================
  adminCategoriesList: def({
    method: 'GET',
    path: '/api/admin/categories',
    ...staff('menu.manage'),
    response: A.CategoriesResponse,
    description: 'Daftar kategori',
  }),
  adminCategoryCreate: def({
    method: 'POST',
    path: '/api/admin/categories',
    ...staff('menu.manage'),
    body: A.CreateCategoryRequest,
    response: A.CategoryResponse,
    description: 'Tambah kategori',
  }),
  adminCategoryUpdate: def({
    method: 'PATCH',
    path: '/api/admin/categories/:id',
    ...staff('menu.manage'),
    params: IdParam,
    body: A.UpdateCategoryRequest,
    response: A.CategoryResponse,
    description: 'Ubah kategori',
  }),
  adminCategoryDelete: def({
    method: 'DELETE',
    path: '/api/admin/categories/:id',
    ...staff('menu.manage'),
    params: IdParam,
    response: OkResponse,
    description: 'Hapus kategori (CONFLICT bila masih ada menu)',
  }),
  adminCategoriesReorder: def({
    method: 'PUT',
    path: '/api/admin/categories/order',
    ...staff('menu.manage'),
    body: A.ReorderRequest,
    response: OkResponse,
    description: 'Atur urutan kategori (atas → bawah)',
  }),
  adminItemsReorder: def({
    method: 'PUT',
    path: '/api/admin/items/order',
    ...staff('menu.manage'),
    body: A.ReorderRequest,
    response: OkResponse,
    description: 'Atur urutan menu (atas → bawah), biasanya per kategori',
  }),
  adminItemsList: def({
    method: 'GET',
    path: '/api/admin/items',
    ...staff('menu.manage'),
    response: A.ItemsResponse,
    description: 'Daftar menu',
  }),
  adminItemGet: def({
    method: 'GET',
    path: '/api/admin/items/:id',
    ...staff('menu.manage'),
    params: IdParam,
    response: A.ItemResponse,
    description: 'Detail menu',
  }),
  adminItemCreate: def({
    method: 'POST',
    path: '/api/admin/items',
    ...staff('menu.manage'),
    body: A.CreateItemRequest,
    response: A.ItemResponse,
    description: 'Tambah menu',
  }),
  adminItemUpdate: def({
    method: 'PATCH',
    path: '/api/admin/items/:id',
    ...staff('menu.manage'),
    params: IdParam,
    body: A.UpdateItemRequest,
    response: A.ItemResponse,
    description: 'Ubah menu',
  }),
  adminItemDelete: def({
    method: 'DELETE',
    path: '/api/admin/items/:id',
    ...staff('menu.manage'),
    params: IdParam,
    response: OkResponse,
    description: 'Hapus menu',
  }),
  adminItemPhoto: def({
    method: 'POST',
    path: '/api/admin/items/:id/photo',
    ...staff('menu.manage'),
    params: IdParam,
    multipart: true,
    response: A.ItemResponse,
    description: 'Upload foto menu (field file)',
  }),
  adminOptionGroupsList: def({
    method: 'GET',
    path: '/api/admin/option-groups',
    ...staff('menu.manage'),
    response: A.OptionGroupsResponse,
    description: 'Daftar grup pilihan',
  }),
  adminOptionGroupCreate: def({
    method: 'POST',
    path: '/api/admin/option-groups',
    ...staff('menu.manage'),
    body: A.CreateOptionGroupRequest,
    response: A.OptionGroupResponse,
    description: 'Tambah grup pilihan (+ pilihan, + pasang ke menu)',
  }),
  adminOptionGroupUpdate: def({
    method: 'PATCH',
    path: '/api/admin/option-groups/:id',
    ...staff('menu.manage'),
    params: IdParam,
    body: A.UpdateOptionGroupRequest,
    response: A.OptionGroupResponse,
    description: 'Ubah grup pilihan',
  }),
  adminOptionGroupDelete: def({
    method: 'DELETE',
    path: '/api/admin/option-groups/:id',
    ...staff('menu.manage'),
    params: IdParam,
    response: OkResponse,
    description: 'Hapus grup pilihan',
  }),
  adminOptionGroupAttach: def({
    method: 'PUT',
    path: '/api/admin/option-groups/:id/items',
    ...staff('menu.manage'),
    params: IdParam,
    body: A.AttachOptionGroupRequest,
    response: A.OptionGroupResponse,
    description: 'Set menu yang memakai grup ini',
  }),
  adminOptionCreate: def({
    method: 'POST',
    path: '/api/admin/option-groups/:id/options',
    ...staff('menu.manage'),
    params: IdParam,
    body: A.CreateOptionRequest,
    response: A.OptionResponse,
    description: 'Tambah pilihan ke grup',
  }),
  adminOptionUpdate: def({
    method: 'PATCH',
    path: '/api/admin/options/:id',
    ...staff('menu.manage'),
    params: IdParam,
    body: A.UpdateOptionRequest,
    response: A.OptionResponse,
    description: 'Ubah pilihan',
  }),
  adminOptionDelete: def({
    method: 'DELETE',
    path: '/api/admin/options/:id',
    ...staff('menu.manage'),
    params: IdParam,
    response: OkResponse,
    description: 'Hapus pilihan',
  }),
  adminPromosList: def({
    method: 'GET',
    path: '/api/admin/promos',
    ...staff('menu.manage'),
    response: A.PromosResponse,
    description: 'Daftar promo',
  }),
  adminPromoCreate: def({
    method: 'POST',
    path: '/api/admin/promos',
    ...staff('menu.manage'),
    body: A.CreatePromoRequest,
    response: A.PromoResponse,
    description: 'Tambah promo',
  }),
  adminPromoUpdate: def({
    method: 'PATCH',
    path: '/api/admin/promos/:id',
    ...staff('menu.manage'),
    params: IdParam,
    body: A.UpdatePromoRequest,
    response: A.PromoResponse,
    description: 'Ubah promo',
  }),
  adminPromoDelete: def({
    method: 'DELETE',
    path: '/api/admin/promos/:id',
    ...staff('menu.manage'),
    params: IdParam,
    response: OkResponse,
    description: 'Hapus promo',
  }),
  adminTranslate: def({
    method: 'POST',
    path: '/api/admin/translate',
    ...staff('menu.manage'),
    body: A.TranslateRequest,
    response: A.TranslateResponse,
    rateLimitPerMin: 20,
    description: 'Terjemahkan otomatis (Gemini / mock)',
  }),

  // ================= Admin: meja & QR =================
  adminTablesList: def({
    method: 'GET',
    path: '/api/admin/tables',
    ...staff('tables.manage'),
    response: T.AdminTablesResponse,
    description: 'Daftar meja + QR',
  }),
  adminTableCreate: def({
    method: 'POST',
    path: '/api/admin/tables',
    ...staff('tables.manage'),
    body: T.CreateTableRequest,
    response: T.AdminTableResponse,
    description: 'Tambah meja (qr_token acak 24+ char)',
  }),
  adminTableUpdate: def({
    method: 'PATCH',
    path: '/api/admin/tables/:id',
    ...staff('tables.manage'),
    params: IdParam,
    body: T.UpdateTableRequest,
    response: T.AdminTableResponse,
    description: 'Ubah meja',
  }),
  adminTableDelete: def({
    method: 'DELETE',
    path: '/api/admin/tables/:id',
    ...staff('tables.manage'),
    params: IdParam,
    response: OkResponse,
    description: 'Hapus meja',
  }),
  adminTableRegenerateQr: def({
    method: 'POST',
    path: '/api/admin/tables/:id/regenerate-qr',
    ...staff('tables.manage'),
    params: IdParam,
    response: T.AdminTableResponse,
    description: 'Buat ulang QR (token lama tidak berlaku)',
  }),
  adminTablesQrPdf: def({
    method: 'GET',
    path: '/api/admin/tables/qr.pdf',
    ...staff('tables.manage'),
    query: T.TablesQrPdfQuery,
    response: 'binary',
    description: 'PDF QR meja (application/pdf)',
  }),

  // ================= Admin: pengguna, role, settings =================
  adminUsersList: def({
    method: 'GET',
    path: '/api/admin/users',
    ...staff('users.manage'),
    response: A.UsersResponse,
    description: 'Daftar pengguna',
  }),
  adminUserCreate: def({
    method: 'POST',
    path: '/api/admin/users',
    ...staff('users.manage'),
    body: A.CreateUserRequest,
    response: A.UserResponse,
    description: 'Tambah pengguna',
  }),
  adminUserUpdate: def({
    method: 'PATCH',
    path: '/api/admin/users/:id',
    ...staff('users.manage'),
    params: IdParam,
    body: A.UpdateUserRequest,
    response: A.UserResponse,
    description: 'Ubah pengguna / reset PIN / buka kunci',
  }),
  adminUserDelete: def({
    method: 'DELETE',
    path: '/api/admin/users/:id',
    ...staff('users.manage'),
    params: IdParam,
    response: OkResponse,
    description: 'Nonaktifkan pengguna',
  }),
  adminRolesList: def({
    method: 'GET',
    path: '/api/admin/roles',
    ...staff('users.manage'),
    response: A.RolesResponse,
    description: 'Daftar role',
  }),
  adminRoleCreate: def({
    method: 'POST',
    path: '/api/admin/roles',
    ...staff('users.manage'),
    body: A.CreateRoleRequest,
    response: A.RoleResponse,
    description: 'Tambah role',
  }),
  adminRoleUpdate: def({
    method: 'PATCH',
    path: '/api/admin/roles/:id',
    ...staff('users.manage'),
    params: IdParam,
    body: A.UpdateRoleRequest,
    response: A.RoleResponse,
    description: 'Ubah role/permission',
  }),
  adminRoleDelete: def({
    method: 'DELETE',
    path: '/api/admin/roles/:id',
    ...staff('users.manage'),
    params: IdParam,
    response: OkResponse,
    description: 'Hapus role (bukan sistem, tanpa user)',
  }),
  adminExpenseCategoryCreate: def({
    method: 'POST',
    path: '/api/admin/expense-categories',
    ...staff('settings.manage'),
    body: A.CreateExpenseCategoryRequest,
    response: A.ExpenseCategoryResponse,
    description: 'Tambah kategori pengeluaran',
  }),
  adminExpenseCategoryUpdate: def({
    method: 'PATCH',
    path: '/api/admin/expense-categories/:id',
    ...staff('settings.manage'),
    params: IdParam,
    body: A.UpdateExpenseCategoryRequest,
    response: A.ExpenseCategoryResponse,
    description: 'Ubah kategori pengeluaran',
  }),
  adminExpenseCategoryDelete: def({
    method: 'DELETE',
    path: '/api/admin/expense-categories/:id',
    ...staff('settings.manage'),
    params: IdParam,
    response: OkResponse,
    description: 'Hapus kategori pengeluaran',
  }),
  adminSettingsGet: def({
    method: 'GET',
    path: '/api/admin/settings',
    ...staff('settings.manage'),
    response: Cfg.AdminSettingsResponse,
    description: 'Semua settings + status integrasi',
  }),
  adminSettingsUpdate: def({
    method: 'PATCH',
    path: '/api/admin/settings',
    ...staff('settings.manage'),
    body: Cfg.SettingsPatch,
    response: Cfg.AdminSettingsResponse,
    description: 'Ubah settings (parsial per bagian)',
  }),
  adminSettingsLogo: def({
    method: 'POST',
    path: '/api/admin/settings/logo',
    ...staff('settings.manage'),
    multipart: true,
    response: Cfg.AdminSettingsResponse,
    description: 'Upload logo → profile.logoUrl',
  }),
  adminSettingsAbaQr: def({
    method: 'POST',
    path: '/api/admin/settings/aba-qr',
    ...staff('settings.manage'),
    multipart: true,
    response: Cfg.AdminSettingsResponse,
    description: 'Upload gambar QR ABA → payment.aba.qrImageUrl',
  }),
  adminSettingsAbaQrDelete: def({
    method: 'DELETE',
    path: '/api/admin/settings/aba-qr',
    ...staff('settings.manage'),
    response: Cfg.AdminSettingsResponse,
    description: 'Hapus gambar QR ABA',
  }),

  // ================= Laporan & audit =================
  reportsDaily: def({
    method: 'GET',
    path: '/api/reports/daily',
    ...staff('reports.view'),
    query: R.DailyReportQuery,
    response: R.DailyReport,
    description: 'Dashboard harian',
  }),
  reportsClosing: def({
    method: 'GET',
    path: '/api/reports/closing/:shiftId',
    ...staff('reports.view', 'shift.manage'),
    params: R.ShiftIdParam,
    response: R.ClosingReportResponse,
    description: 'Laporan closing shift',
  }),
  auditLogs: def({
    method: 'GET',
    path: '/api/audit-logs',
    ...staff('reports.view'),
    query: A.AuditLogsQuery,
    response: A.AuditLogsResponse,
    description: 'Audit log (kursor before)',
  }),
} as const satisfies Record<string, EndpointDef>;

export type Endpoints = typeof endpoints;
export type EndpointKey = keyof Endpoints;

type InferOr<T, Fallback> = T extends z.ZodType ? z.input<T> : Fallback;
type OutOr<T, Fallback> = T extends z.ZodType ? z.output<T> : Fallback;

/** Input yang dikirim klien (sebelum default Zod diterapkan). */
export type EndpointParams<K extends EndpointKey> = Endpoints[K] extends { params: infer P }
  ? InferOr<P, never>
  : undefined;
export type EndpointQuery<K extends EndpointKey> = Endpoints[K] extends { query: infer Q }
  ? InferOr<Q, never>
  : undefined;
export type EndpointBody<K extends EndpointKey> = Endpoints[K] extends { multipart: true }
  ? FormData
  : Endpoints[K] extends { body: infer B }
    ? InferOr<B, never>
    : undefined;
/** Data yang diterima server setelah parse Zod. */
export type ParsedParams<K extends EndpointKey> = Endpoints[K] extends { params: infer P }
  ? OutOr<P, never>
  : undefined;
export type ParsedQuery<K extends EndpointKey> = Endpoints[K] extends { query: infer Q }
  ? OutOr<Q, never>
  : undefined;
export type ParsedBody<K extends EndpointKey> = Endpoints[K] extends { body: infer B }
  ? OutOr<B, never>
  : undefined;
/** Respons (JSON) — `Blob` untuk endpoint binary. */
export type EndpointResponse<K extends EndpointKey> = Endpoints[K]['response'] extends z.ZodType
  ? z.output<Endpoints[K]['response']>
  : Blob;

/** Ganti `:param` di path. */
export function buildPath(path: string, params?: Record<string, string | number> | undefined): string {
  return path.replace(/:([A-Za-z_]+)/g, (_, k: string) => {
    const v = params?.[k];
    if (v === undefined) throw new Error(`Param path '${k}' kosong untuk ${path}`);
    return encodeURIComponent(String(v));
  });
}

/** Path API per key, mis. `API_PATHS.orderCreate === '/api/orders'`. */
export const API_PATHS = Object.fromEntries(Object.entries(endpoints).map(([k, v]) => [k, v.path])) as {
  [K in EndpointKey]: Endpoints[K]['path'];
};

export const API_PREFIX = '/api';
export const SOCKET_PATH = '/ws';
export const TELEGRAM_WEBHOOK_PATH = '/tg/webhook';
export const UPLOADS_PATH = '/uploads';
/** Cookie sesi. */
export const STAFF_SESSION_COOKIE = 'pos_sid';
export const CUSTOMER_SESSION_COOKIE = 'pos_cust';
