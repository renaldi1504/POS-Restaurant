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

/** `GET /reports/closing/:shiftId` — laporan closing untuk dicetak. */
export const ClosingReportResponse = z.object({
  shift: ShiftDto,
  closing: ClosingDto.nullable(),
  preview: ClosingPreview,
});
export type ClosingReportResponse = z.infer<typeof ClosingReportResponse>;

export const ShiftIdParam = z.object({ shiftId: z.coerce.number().int().positive() });
