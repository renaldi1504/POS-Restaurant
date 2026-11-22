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
  /** Laporan owner: penjualan, pengeluaran, laba kotor & menu terlaris per periode. */
  'reports.owner',
  'settings.manage',
  'users.manage',
  'tables.manage',
  'driver.deliver',
] as const;
export const PermissionKey = z.enum(PERMISSION_KEYS);
export type PermissionKey = z.infer<typeof PermissionKey>;

/**
 * Daftar izin di RESPONS server: izin yang belum dikenal aplikasi (versi lama yang masih terbuka
 * saat server sudah diperbarui) diabaikan, bukan membuat respons ditolak.
 */
export const PermissionList = z
  .array(z.string())
  .transform((xs) =>
    xs.filter((x): x is PermissionKey => (PERMISSION_KEYS as readonly string[]).includes(x)),
  );

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

/** Label permission untuk UI: kamus pos-web `perm.<key dengan . → _>` (4 bahasa). */
export const permissionI18nKey = (k: PermissionKey): string => `perm.${k.replace(/\./g, '_')}`;

export function hasPermission(perms: readonly string[] | undefined | null, key: PermissionKey): boolean {
  return !!perms && perms.includes(key);
}

export function hasAnyPermission(
  perms: readonly string[] | undefined | null,
  keys: PermissionKey[],
): boolean {
  return keys.some((k) => hasPermission(perms, k));
}
