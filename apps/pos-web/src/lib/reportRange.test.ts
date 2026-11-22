import { describe, expect, it } from 'vitest';
import { groupSeries, pctChange, periodRange } from './reportRange';

describe('periode laporan', () => {
  // 2026-11-22 = Minggu
  const today = '2026-11-22';
  it('hari ini, kemarin, minggu ini/lalu (mulai Senin)', () => {
    expect(periodRange('today', today)).toEqual({ from: today, to: today });
    expect(periodRange('yesterday', today)).toEqual({ from: '2026-11-21', to: '2026-11-21' });
    expect(periodRange('thisWeek', today)).toEqual({ from: '2026-11-16', to: today });
    expect(periodRange('lastWeek', today)).toEqual({ from: '2026-11-09', to: '2026-11-15' });
    expect(periodRange('thisWeek', '2026-11-16')).toEqual({ from: '2026-11-16', to: '2026-11-16' });
  });
  it('bulan ini/lalu (termasuk pergantian tahun), tahun ini', () => {
    expect(periodRange('thisMonth', today)).toEqual({ from: '2026-11-01', to: today });
    expect(periodRange('lastMonth', today)).toEqual({ from: '2026-10-01', to: '2026-10-31' });
    expect(periodRange('lastMonth', '2027-01-05')).toEqual({ from: '2026-12-01', to: '2026-12-31' });
    expect(periodRange('lastMonth', '2028-03-10')).toEqual({ from: '2028-02-01', to: '2028-02-29' });
    expect(periodRange('thisYear', today)).toEqual({ from: '2026-01-01', to: today });
  });
  it('persentase & pengelompokan bulanan', () => {
    expect(pctChange(150, 100)).toBe(50);
    expect(pctChange(50, 100)).toBe(-50);
    expect(pctChange(10, 0)).toBeNull();
    const days = Array.from({ length: 70 }, (_, i) => ({
      date:
        i < 31 ? `2026-01-${String(i + 1).padStart(2, '0')}` : `2026-02-${String(i - 30).padStart(2, '0')}`,
      sales: 1,
      expenses: 0,
      orders: 1,
    }));
    const g = groupSeries(days);
    expect(g[0]).toEqual({ key: '2026-01', sales: 31, expenses: 0, orders: 31, monthly: true });
    expect(groupSeries(days.slice(0, 7))).toHaveLength(7);
  });
});
