import type { Dict } from './id';

/** Bagian kamus yang wajib lengkap di SEMUA bahasa (dapur, driver, login, order-web). */
export const CUSTOMER_FACING_SECTIONS = [
  'common',
  'lang',
  'status',
  'channel',
  'orderType',
  'paymentStatus',
  'paymentMethod',
  'errors',
  'kitchen',
  'driver',
  'order',
  'auth',
] as const;
export type CustomerFacingSection = (typeof CUSTOMER_FACING_SECTIONS)[number];

type DeepPartial<T> = { [K in keyof T]?: T[K] extends string ? string : DeepPartial<T[K]> };

/** Kamus kh/zh: bagian customer-facing lengkap, sisanya opsional (fallback en → id). */
export type CustomerFacingDict = Pick<Dict, CustomerFacingSection> &
  DeepPartial<Omit<Dict, CustomerFacingSection>>;
