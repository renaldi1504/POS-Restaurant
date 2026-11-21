import type { Dict } from './id';

/**
 * Bagian kamus yang dipakai web pelanggan (order-web). Sejak semua layar staf juga 4 bahasa, kh & zh
 * wajib lengkap untuk SEMUA bagian (tipe `Dict`); daftar ini tetap dipakai test sebagai pengingat bagian
 * yang terlihat pelanggan.
 */
export const CUSTOMER_FACING_SECTIONS = [
  'common',
  'lang',
  'status',
  'channel',
  'orderType',
  'paymentStatus',
  'paymentMethod',
  'errors',
  'errorReason',
  'kitchen',
  'driver',
  'order',
  'auth',
] as const;
export type CustomerFacingSection = (typeof CUSTOMER_FACING_SECTIONS)[number];
export type CustomerFacingDict = Pick<Dict, CustomerFacingSection>;
