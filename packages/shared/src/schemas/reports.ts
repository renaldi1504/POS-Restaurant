import { z } from 'zod';
import { Currency } from '../enums';
import { LocalizedText } from '../localized';
import { Id, MoneyAmount, Ymd } from './common';
import { ChannelSummary, ClosingDto, ClosingPreview, MethodSummary, ShiftDto } from './shifts';

/** `GET /reports/daily?date=` (default: hari operasional berjalan). */
export const DailyReportQuery = z.object({ date: Ymd.optional() });

export const HourlyPoint = z.object({
  /** Jam lokal 0–23. */
  hour: z.number().int().min(0).max(23),
  total: MoneyAmount,
  count: z.number().int().nonnegative(),
});
export type HourlyPoint = z.infer<typeof HourlyPoint>;

export const TopItem = z.object({
  itemId: Id.nullable(),
  name: LocalizedText,
  qty: z.number().int().nonnegative(),
  total: MoneyAmount,
});
export type TopItem = z.infer<typeof TopItem>;

export const DailyReport = z.object({
  date: Ymd,
  currency: Currency,
  /** Penjualan kotor (order selesai/terbayar, tidak termasuk batal/tolak). */
  totalSales: MoneyAmount,
  /** Setelah promo & komisi platform. */
  netSales: MoneyAmount,
  orderCount: z.number().int().nonnegative(),
  averageOrder: MoneyAmount,
  expensesTotal: MoneyAmount,
  cancelledCount: z.number().int().nonnegative(),
  byHour: z.array(HourlyPoint),
  byChannel: z.array(ChannelSummary),
  byMethod: z.array(MethodSummary),
  topItems: z.array(TopItem),
  shifts: z.array(ShiftDto),
});
export type DailyReport = z.infer<typeof DailyReport>;

// ---------- Laporan owner (rentang tanggal) ----------
/** `GET /reports/range?from=&to=` — hari operasional inklusif, maks 400 hari. */
export const RangeReportQuery = z
  .object({ from: Ymd, to: Ymd })
  .refine((q) => q.from <= q.to, { message: 'Tanggal awal harus sebelum tanggal akhir', path: ['to'] });
export type RangeReportQuery = z.infer<typeof RangeReportQuery>;

export const DayPoint = z.object({
  date: Ymd,
  sales: MoneyAmount,
  expenses: MoneyAmount,
  orders: z.number().int().nonnegative(),
});
export type DayPoint = z.infer<typeof DayPoint>;

export const ExpenseCategoryTotal = z.object({
  category: z.string(),
  total: MoneyAmount,
  count: z.number().int().nonnegative(),
});
export type ExpenseCategoryTotal = z.infer<typeof ExpenseCategoryTotal>;

export const RangeTotals = z.object({
  totalSales: MoneyAmount,
  netSales: MoneyAmount,
  expensesTotal: MoneyAmount,
  /** Penjualan bersih − pengeluaran. */
  grossProfit: MoneyAmount,
  orderCount: z.number().int().nonnegative(),
});
export type RangeTotals = z.infer<typeof RangeTotals>;

export const RangeReport = RangeTotals.extend({
  from: Ymd,
  to: Ymd,
  days: z.number().int().positive(),
  currency: Currency,
  averageOrder: MoneyAmount,
  cancelledCount: z.number().int().nonnegative(),
  /** Order aktif yang belum dibayar/selesai di rentang ini (belum masuk penjualan). */
  unpaid: z
    .object({ count: z.number().int().nonnegative(), total: MoneyAmount })
    .default({ count: 0, total: 0 }),
  byDay: z.array(DayPoint),
  byChannel: z.array(ChannelSummary),
  byMethod: z.array(MethodSummary),
  topItems: z.array(TopItem),
  expensesByCategory: z.array(ExpenseCategoryTotal),
  /** Periode sebelumnya dengan panjang sama (untuk perbandingan naik/turun). */
  previous: RangeTotals.extend({ from: Ymd, to: Ymd }),
});
export type RangeReport = z.infer<typeof RangeReport>;

/** `GET /reports/closing/:shiftId` — laporan closing untuk dicetak. */
export const ClosingReportResponse = z.object({
  shift: ShiftDto,
  closing: ClosingDto.nullable(),
  preview: ClosingPreview,
});
export type ClosingReportResponse = z.infer<typeof ClosingReportResponse>;

export const ShiftIdParam = z.object({ shiftId: z.coerce.number().int().positive() });
