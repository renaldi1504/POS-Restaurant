/** Pilihan periode laporan owner → rentang hari operasional [from, to] (YYYY-MM-DD, inklusif). */
import { addDays } from '@pos/shared';

export const PERIODS = [
  'today',
  'yesterday',
  'thisWeek',
  'lastWeek',
  'thisMonth',
  'lastMonth',
  'thisYear',
  'custom',
] as const;
export type Period = (typeof PERIODS)[number];

/** 0 = Senin … 6 = Minggu (minggu dimulai Senin). */
function weekdayMon(ymd: string): number {
  const d = new Date(`${ymd}T00:00:00Z`).getUTCDay();
  return (d + 6) % 7;
}

function monthStart(ymd: string): string {
  return `${ymd.slice(0, 7)}-01`;
}

/** Rentang untuk periode, relatif terhadap hari operasional berjalan `today`. */
export function periodRange(period: Exclude<Period, 'custom'>, today: string): { from: string; to: string } {
  switch (period) {
    case 'today':
      return { from: today, to: today };
    case 'yesterday': {
      const y = addDays(today, -1);
      return { from: y, to: y };
    }
    case 'thisWeek':
      return { from: addDays(today, -weekdayMon(today)), to: today };
    case 'lastWeek': {
      const thisMon = addDays(today, -weekdayMon(today));
      return { from: addDays(thisMon, -7), to: addDays(thisMon, -1) };
    }
    case 'thisMonth':
      return { from: monthStart(today), to: today };
    case 'lastMonth': {
      const lastDay = addDays(monthStart(today), -1);
      return { from: monthStart(lastDay), to: lastDay };
    }
    case 'thisYear':
      return { from: `${today.slice(0, 4)}-01-01`, to: today };
  }
}

/** Persentase perubahan vs periode sebelumnya (null bila sebelumnya 0). */
export function pctChange(now: number, before: number): number | null {
  if (!before) return null;
  return Math.round(((now - before) / Math.abs(before)) * 100);
}

/** Kelompokkan per bulan bila rentang panjang (> 62 hari) supaya grafik tetap terbaca. */
export function groupSeries<T extends { date: string; sales: number; expenses: number; orders: number }>(
  byDay: T[],
): { key: string; sales: number; expenses: number; orders: number; monthly: boolean }[] {
  if (byDay.length <= 62) return byDay.map((d) => ({ key: d.date, ...pick(d), monthly: false }));
  const m = new Map<string, { sales: number; expenses: number; orders: number }>();
  for (const d of byDay) {
    const k = d.date.slice(0, 7);
    const b = m.get(k) ?? { sales: 0, expenses: 0, orders: 0 };
    b.sales += d.sales;
    b.expenses += d.expenses;
    b.orders += d.orders;
    m.set(k, b);
  }
  return [...m.entries()].map(([key, v]) => ({ key, ...v, monthly: true }));
}

const pick = (d: { sales: number; expenses: number; orders: number }) => ({
  sales: d.sales,
  expenses: d.expenses,
  orders: d.orders,
});
