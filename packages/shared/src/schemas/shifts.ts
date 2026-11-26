import { z } from 'zod';
import { Currency, ExpenseSource, OrderChannel, PaymentMethod } from '../enums';
import {
  DenominationCounts,
  Id,
  IsoDateTime,
  MoneyAmount,
  MoneyByCurrency,
  PositiveMoney,
  SignedMoneyByCurrency,
  UserRef,
  Ymd,
} from './common';

// ---------- Shift ----------
export const ShiftDto = z.object({
  id: Id,
  businessDate: Ymd,
  name: z.string(),
  user: UserRef,
  openedAt: IsoDateTime,
  closedAt: IsoDateTime.nullable(),
  openingCash: MoneyByCurrency,
  /** Modal yang seharusnya (sisa laci closing sebelumnya) & catatan bila berbeda. */
  openingExpected: MoneyByCurrency.nullable().optional(),
  openingNote: z.string().nullable().optional(),
});
export type ShiftDto = z.infer<typeof ShiftDto>;

export const OpenShiftRequest = z.object({
  name: z.string().trim().min(1).max(30),
  /** Total modal awal per mata uang (minor). */
  openingCash: MoneyByCurrency,
  /** Rincian per pecahan (opsional, untuk catatan). */
  denominations: DenominationCounts.optional(),
  /** Wajib bila modal berbeda dengan sisa laci closing terakhir (OPENING_NOTE_REQUIRED). */
  note: z.string().trim().max(500).optional(),
});
export type OpenShiftRequest = z.input<typeof OpenShiftRequest>;

/** `GET /shifts/opening-suggestion` — modal yang seharusnya ada di laci (sisa closing terakhir). */
export const OpeningSuggestionResponse = z.object({
  expected: MoneyByCurrency.nullable(),
  fromShift: z.object({ id: Id, name: z.string(), closedAt: IsoDateTime.nullable() }).nullable(),
});
export type OpeningSuggestionResponse = z.infer<typeof OpeningSuggestionResponse>;

export const ShiftResponse = z.object({ shift: ShiftDto });
export type ShiftResponse = z.infer<typeof ShiftResponse>;
/** `GET /shifts/current` — shift terbuka (siapa pun yang membuka); null bila belum ada. */
export const CurrentShiftResponse = z.object({ shift: ShiftDto.nullable() });
export type CurrentShiftResponse = z.infer<typeof CurrentShiftResponse>;

// ---------- Pengeluaran ----------
export const ExpenseCategoryDto = z.object({ id: Id, name: z.string() });
export type ExpenseCategoryDto = z.infer<typeof ExpenseCategoryDto>;
export const ExpenseCategoriesResponse = z.object({ categories: z.array(ExpenseCategoryDto) });
export type ExpenseCategoriesResponse = z.infer<typeof ExpenseCategoriesResponse>;

export const ExpenseDto = z.object({
  id: Id,
  shiftId: Id,
  category: ExpenseCategoryDto,
  amount: MoneyAmount,
  currency: Currency,
  source: ExpenseSource,
  note: z.string().nullable(),
  photoUrl: z.string().nullable(),
  createdBy: UserRef.nullable(),
  createdAt: IsoDateTime,
});
export type ExpenseDto = z.infer<typeof ExpenseDto>;

/** `GET /expenses?shiftId=&date=` — default: shift berjalan. */
export const ListExpensesQuery = z.object({
  shiftId: z.coerce.number().int().positive().optional(),
  date: Ymd.optional(),
});
export const ExpensesResponse = z.object({
  expenses: z.array(ExpenseDto),
  /** Total per sumber dalam mata uang utama. */
  totalCashMain: MoneyAmount,
  totalAbaMain: MoneyAmount,
});
export type ExpensesResponse = z.infer<typeof ExpensesResponse>;

/** `POST /expenses` — foto diunggah dulu lewat `POST /expenses/photo` (multipart) → photoUrl. */
export const CreateExpenseRequest = z.object({
  categoryId: Id,
  amount: PositiveMoney,
  currency: Currency,
  source: ExpenseSource,
  note: z.string().trim().max(300).optional(),
  photoUrl: z.string().max(500).optional(),
});
export type CreateExpenseRequest = z.infer<typeof CreateExpenseRequest>;
export const ExpenseResponse = z.object({ expense: ExpenseDto });
export type ExpenseResponse = z.infer<typeof ExpenseResponse>;

/** Respons upload file generik. */
export const UploadResponse = z.object({ url: z.string() });
export type UploadResponse = z.infer<typeof UploadResponse>;

// ---------- Setoran driver ----------
export const DriverSettlementDto = z.object({
  id: Id,
  shiftId: Id,
  driver: UserRef,
  deliveries: z.number().int().nonnegative(),
  /** Cash yang dibawa driver (mata uang utama). */
  cashCollected: MoneyAmount,
  settledAt: IsoDateTime.nullable(),
});
export type DriverSettlementDto = z.infer<typeof DriverSettlementDto>;
export const DriverSettlementResponse = z.object({ settlement: DriverSettlementDto });
export type DriverSettlementResponse = z.infer<typeof DriverSettlementResponse>;

// ---------- Closing ----------
export const ChannelSummary = z.object({
  channel: OrderChannel,
  count: z.number().int().nonnegative(),
  gross: MoneyAmount,
  discount: MoneyAmount,
  commission: MoneyAmount,
  /** gross − discount − commission */
  net: MoneyAmount,
});
export type ChannelSummary = z.infer<typeof ChannelSummary>;

export const MethodSummary = z.object({
  method: PaymentMethod,
  /** Diterima per mata uang (minor, setelah kembalian untuk cash KHR). */
  byCurrency: SignedMoneyByCurrency,
  totalMain: MoneyAmount,
});
export type MethodSummary = z.infer<typeof MethodSummary>;

export const ClosingExpected = z.object({
  /** modal + jual cash − keluar cash (dikonversi ke mata uang utama). */
  cashMain: MoneyAmount,
  /** jual ABA − keluar ABA. */
  abaMain: MoneyAmount,
  /** Cash seharusnya per mata uang (informasi). */
  cashByCurrency: SignedMoneyByCurrency,
});
export type ClosingExpected = z.infer<typeof ClosingExpected>;

/**
 * "Kantong" uang closing, per metode × mata uang, TANPA konversi kurs:
 * cash: modal + diterima − kembalian − pengeluaran cash; aba: diterima − pengeluaran ABA.
 */
export const ClosingPocket = z.object({
  method: z.enum(['cash', 'aba']),
  currency: Currency,
  opening: MoneyAmount,
  sales: MoneyAmount,
  change: MoneyAmount,
  expenses: MoneyAmount,
  expected: MoneyAmount,
});
export type ClosingPocket = z.infer<typeof ClosingPocket>;

export const ClosingPocketResult = z.object({
  method: z.enum(['cash', 'aba']),
  currency: Currency,
  expected: MoneyAmount,
  actual: MoneyAmount,
  diff: MoneyAmount,
});
export type ClosingPocketResult = z.infer<typeof ClosingPocketResult>;

export const ClosingActual = z.object({
  cashMain: MoneyAmount,
  abaMain: MoneyAmount,
  cashByCurrency: SignedMoneyByCurrency,
  denominations: DenominationCounts.optional(),
  /** Total masuk ABA per rekening (mata uang). */
  abaByCurrency: MoneyByCurrency.optional(),
  /** Ditinggal di laci untuk shift berikutnya & disetor ke owner. */
  kept: MoneyByCurrency.optional(),
  deposit: MoneyByCurrency.optional(),
});
export type ClosingActual = z.infer<typeof ClosingActual>;

export const ClosingDiff = z.object({
  cashMain: MoneyAmount,
  abaMain: MoneyAmount,
  /** Selisih per kantong (cash/ABA × mata uang). */
  pockets: z.array(ClosingPocketResult).optional(),
});
export type ClosingDiff = z.infer<typeof ClosingDiff>;

/** `GET /closing/preview?shiftId=` (default: shift berjalan). */
export const ClosingPreviewQuery = z.object({ shiftId: z.coerce.number().int().positive().optional() });
export const ClosingPreview = z.object({
  shift: ShiftDto,
  currency: Currency,
  openingCash: MoneyByCurrency,
  openingCashMain: MoneyAmount,
  orderCount: z.number().int().nonnegative(),
  /** Order batal/ditolak di shift ini (tambahan, opsional). */
  cancelledCount: z.number().int().nonnegative().optional(),
  salesTotalMain: MoneyAmount,
  byChannel: z.array(ChannelSummary),
  byMethod: z.array(MethodSummary),
  expenses: z.object({
    cashMain: MoneyAmount,
    abaMain: MoneyAmount,
    cashByCurrency: SignedMoneyByCurrency,
    count: z.number().int().nonnegative(),
  }),
  expected: ClosingExpected,
  /** Seharusnya per kantong (cash/ABA × mata uang), tanpa konversi. */
  pockets: z.array(ClosingPocket).default([]),
  /** Usulan uang ditinggal di laci (modal tetap di Pengaturan). */
  suggestedKeep: MoneyByCurrency.default({ KHR: 0, USD: 0, IDR: 0 }),
  drivers: z.array(DriverSettlementDto),
  /** Order yang belum lunas / masih aktif (peringatan sebelum closing). */
  unpaidOrderCount: z.number().int().nonnegative(),
  activeOrderCount: z.number().int().nonnegative(),
});
export type ClosingPreview = z.infer<typeof ClosingPreview>;

/** `POST /closing` — selisih ≠ 0 wajib `note` (CLOSING_NOTE_REQUIRED). */
export const CreateClosingRequest = z.object({
  shiftId: Id,
  actual: z.object({
    cashByCurrency: MoneyByCurrency,
    denominations: DenominationCounts.optional(),
    /** Lama: total ABA dalam mata uang utama. Dipakai bila `abaByCurrency` tidak dikirim. */
    abaMain: MoneyAmount.optional(),
    /** Total uang masuk ABA shift ini per rekening (KHR / USD), dari riwayat aplikasi ABA. */
    abaByCurrency: MoneyByCurrency.optional(),
  }),
  /** Uang cash yang ditinggal di laci untuk shift berikutnya (≤ uang fisik); sisanya disetor. */
  kept: MoneyByCurrency.optional(),
  note: z.string().trim().max(500).optional(),
});
export type CreateClosingRequest = z.input<typeof CreateClosingRequest>;

export const ClosingDto = z.object({
  shiftId: Id,
  expected: ClosingExpected,
  actual: ClosingActual,
  diff: ClosingDiff,
  note: z.string().nullable(),
  createdBy: UserRef.nullable(),
  createdAt: IsoDateTime,
});
export type ClosingDto = z.infer<typeof ClosingDto>;

export const ClosingResult = z.object({ closing: ClosingDto, preview: ClosingPreview });
export type ClosingResult = z.infer<typeof ClosingResult>;
