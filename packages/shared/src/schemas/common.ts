import { z } from 'zod';
import { Currency, ErrorCode } from '../enums';

/** ID integer (serial) — dipakai semua tabel kecuali `orders` (uuid). */
export const Id = z.number().int().positive();
export type Id = z.infer<typeof Id>;
/** Param path `:id` integer (string di URL → number). */
export const IdParam = z.object({ id: z.coerce.number().int().positive() });
export type IdParam = z.infer<typeof IdParam>;

export const Uuid = z.string().uuid();
/** Param path `:id` uuid (order). */
export const UuidParam = z.object({ id: z.string().uuid() });
export type UuidParam = z.infer<typeof UuidParam>;

/** Jumlah uang dalam satuan minor (bilangan bulat). */
export const MoneyAmount = z.number().int();
export const NonNegMoney = z.number().int().nonnegative();
export const PositiveMoney = z.number().int().positive();

/** Jumlah per mata uang, mis. modal awal `{KHR: 200000, USD: 2000, IDR: 0}`. */
export const MoneyByCurrency = z.object({
  KHR: NonNegMoney.default(0),
  USD: NonNegMoney.default(0),
  IDR: NonNegMoney.default(0),
});
export type MoneyByCurrency = z.infer<typeof MoneyByCurrency>;

/** Jumlah per mata uang yang boleh negatif (selisih). */
export const SignedMoneyByCurrency = z.object({ KHR: MoneyAmount, USD: MoneyAmount, IDR: MoneyAmount });
export type SignedMoneyByCurrency = z.infer<typeof SignedMoneyByCurrency>;

/** Hitungan per pecahan: `{ KHR: { "50000": 3, "10000": 5 }, USD: {...} }` (key = nominal minor). */
export const DenominationCounts = z.object({
  KHR: z.record(z.string(), z.number().int().nonnegative()).optional(),
  USD: z.record(z.string(), z.number().int().nonnegative()).optional(),
  IDR: z.record(z.string(), z.number().int().nonnegative()).optional(),
});
export type DenominationCounts = z.infer<typeof DenominationCounts>;

export const MoneyValue = z.object({ amount: MoneyAmount, currency: Currency });
export type MoneyValue = z.infer<typeof MoneyValue>;

/** Tanggal operasional "YYYY-MM-DD". */
export const Ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal YYYY-MM-DD');
/** Jam "HH:MM". */
export const HHMM = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Format jam HH:MM');
/** Timestamp ISO-8601 (response; server mengirim `Date.toISOString()`). */
export const IsoDateTime = z.string();
/** Timestamp ISO-8601 di request (divalidasi). */
export const IsoDateTimeInput = z.iso.datetime({ offset: true });

export const Pin = z.string().regex(/^\d{4}$/, 'PIN harus 4 angka');

export const Lat = z.number().min(-90).max(90);
export const Lng = z.number().min(-180).max(180);

/** Referensi singkat ke user (kasir/driver/pembuat). */
export const UserRef = z.object({ id: Id, name: z.string() });
export type UserRef = z.infer<typeof UserRef>;

export const OkResponse = z.object({ ok: z.literal(true) });
export type OkResponse = z.infer<typeof OkResponse>;

/** Format error semua endpoint: `{ error: { code, message, details? } }`. */
export const ErrorResponse = z.object({
  error: z.object({
    code: ErrorCode,
    message: z.string(),
    details: z.unknown().optional(),
  }),
});
export type ErrorResponse = z.infer<typeof ErrorResponse>;

/** Query daftar dengan kursor (audit log). */
export const CursorQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  before: z.coerce.number().int().positive().optional(),
});

/** Query boolean dari string URL ("true"/"1"). */
export const QueryBool = z
  .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
  .transform((v) => v === true || v === 'true' || v === '1');

/** Daftar id dipisah koma di query: `?ids=1,2,3`. */
export const QueryIdList = z
  .string()
  .regex(/^\d+(,\d+)*$/)
  .transform((s) => s.split(',').map(Number));
