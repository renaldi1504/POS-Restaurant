import { z } from 'zod';

/** Semua permission key (SPEC §2). Role menyimpan daftar key di kolom JSONB `permissions`. */
export const PERMISSION_KEYS = [
  'order.create',
  'payment.create',
  'order.accept',
  'order.cancel_paid',
  'kitchen.view',
  'kitchen.update',
  'menu.toggle_available',
  'shift.manage',
  'menu.manage',
  'reports.view',
  'settings.manage',
  'users.manage',
  'tables.manage',
  'driver.deliver',
] as const;
export const PermissionKey = z.enum(PERMISSION_KEYS);
export type PermissionKey = z.infer<typeof PermissionKey>;

/** Nama role bawaan (kolom `roles.name`, `system = true`). */
export const ROLE_NAMES = {
  owner: 'Owner',
  cashier: 'Kasir',
  kitchen: 'Dapur',
  driver: 'Driver',
  bot: 'Bot Telegram',
} as const;
export type SystemRoleKey = keyof typeof ROLE_NAMES;

/** Permission default tiap role bawaan (dipakai seed). */
export const DEFAULT_ROLE_PERMISSIONS: Record<SystemRoleKey, PermissionKey[]> = {
  owner: [...PERMISSION_KEYS],
  cashier: [
    'order.create',
    'payment.create',
    'order.accept',
    'kitchen.view',
    'menu.toggle_available',
    'shift.manage',
  ],
  kitchen: ['kitchen.view', 'kitchen.update', 'menu.toggle_available'],
  driver: ['driver.deliver'],
  // Bot hanya membuat order online (status pending_accept) lewat service internal; tidak bisa login.
  bot: [],
};

/** Label permission untuk editor role (id). */
export const PERMISSION_LABELS: Record<PermissionKey, { id: string; en: string }> = {
  'order.create': { id: 'Buat order', en: 'Create orders' },
  'payment.create': { id: 'Terima pembayaran', en: 'Take payments' },
  'order.accept': { id: 'Terima/tolak order online', en: 'Accept/reject online orders' },
  'order.cancel_paid': { id: 'Batalkan order yang sudah dibayar', en: 'Cancel paid orders' },
  'kitchen.view': { id: 'Lihat layar dapur', en: 'View kitchen screen' },
  'kitchen.update': { id: 'Ubah status masak', en: 'Update cooking status' },
  'menu.toggle_available': { id: 'Tandai menu habis/tersedia', en: 'Toggle menu availability' },
  'shift.manage': { id: 'Shift, pengeluaran, closing', en: 'Shifts, expenses, closing' },
  'menu.manage': { id: 'Kelola menu, opsi, harga, promo', en: 'Manage menu, options, prices, promos' },
  'reports.view': { id: 'Lihat laporan', en: 'View reports' },
  'settings.manage': { id: 'Ubah pengaturan', en: 'Manage settings' },
  'users.manage': { id: 'Kelola pengguna & role', en: 'Manage users & roles' },
  'tables.manage': { id: 'Kelola meja & QR', en: 'Manage tables & QR' },
  'driver.deliver': { id: 'Antar pesanan (driver)', en: 'Deliver orders (driver)' },
};

export function hasPermission(perms: readonly string[] | undefined | null, key: PermissionKey): boolean {
  return !!perms && perms.includes(key);
}

export function hasAnyPermission(
  perms: readonly string[] | undefined | null,
  keys: PermissionKey[],
): boolean {
  return keys.some((k) => hasPermission(perms, k));
}
