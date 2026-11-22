import { describe, expect, it } from 'vitest';
import {
  addDays,
  businessDate,
  businessDayRange,
  isOpenAt,
  localHour,
  zonedTimeToUtc,
} from '../src/businessDate';

const hours = { open: '08:00', close: '03:00' };
// Asia/Phnom_Penh = UTC+7 (tanpa DST)
const at = (isoLocal: string) => new Date(`${isoLocal}+07:00`);

describe('businessDate (08:00–03:00, Asia/Phnom_Penh)', () => {
  it('daytime counts as same day', () => {
    expect(businessDate(at('2026-11-21T08:00:00'), hours)).toBe('2026-11-21');
    expect(businessDate(at('2026-11-21T23:59:00'), hours)).toBe('2026-11-21');
  });
  it('after midnight before close counts as previous day', () => {
    expect(businessDate(at('2026-11-22T00:30:00'), hours)).toBe('2026-11-21');
    expect(businessDate(at('2026-11-22T02:59:00'), hours)).toBe('2026-11-21');
  });
  it('at/after close counts as the calendar day', () => {
    expect(businessDate(at('2026-11-22T03:00:00'), hours)).toBe('2026-11-22');
    expect(businessDate(at('2026-11-22T07:00:00'), hours)).toBe('2026-11-22');
  });
  it('handles month/year boundaries', () => {
    expect(businessDate(at('2027-01-01T01:00:00'), hours)).toBe('2026-12-31');
    expect(businessDate(at('2026-03-01T02:00:00'), hours)).toBe('2026-02-28');
  });
  it('uses business timezone, not UTC', () => {
    // 2026-11-21T20:00Z = 2026-11-22 03:00 lokal
    expect(businessDate(new Date('2026-11-21T20:00:00Z'), hours)).toBe('2026-11-22');
    // 2026-11-21T18:00Z = 2026-11-22 01:00 lokal → hari sebelumnya
    expect(businessDate(new Date('2026-11-21T18:00:00Z'), hours)).toBe('2026-11-21');
  });
  it('non-overnight schedule = calendar day', () => {
    expect(businessDate(at('2026-11-22T00:30:00'), { open: '07:00', close: '22:00' })).toBe('2026-11-22');
  });
});

describe('helpers', () => {
  it('addDays', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
  it('zonedTimeToUtc', () => {
    expect(zonedTimeToUtc('2026-11-21', '08:00').toISOString()).toBe('2026-11-21T01:00:00.000Z');
  });
  it('businessDayRange covers 03:00 → 03:00 next day', () => {
    const r = businessDayRange('2026-11-21', hours);
    expect(r.start.toISOString()).toBe('2026-11-20T20:00:00.000Z');
    expect(r.end.toISOString()).toBe('2026-11-21T20:00:00.000Z');
  });
  it('isOpenAt', () => {
    expect(isOpenAt(at('2026-11-21T10:00:00'), hours)).toBe(true);
    expect(isOpenAt(at('2026-11-22T02:00:00'), hours)).toBe(true);
    expect(isOpenAt(at('2026-11-22T05:00:00'), hours)).toBe(false);
    expect(isOpenAt(at('2026-11-21T10:00:00'), { ...hours, holidays: ['2026-11-21'] })).toBe(false);
  });
  it('localHour', () => {
    expect(localHour(new Date('2026-11-21T01:00:00Z'))).toBe(8);
  });
});

describe('beberapa sesi buka (08:00–14:00 & 17:00–20:00)', () => {
  const split = {
    open: '08:00',
    close: '20:00',
    periods: [
      { open: '08:00', close: '14:00' },
      { open: '17:00', close: '20:00' },
    ],
  };
  it('buka di dalam sesi, tutup saat istirahat & setelah tutup', async () => {
    const { isOpenAt: open } = await import('../src/businessDate');
    expect(open(at('2026-11-21T09:00:00'), split)).toBe(true);
    expect(open(at('2026-11-21T14:00:00'), split)).toBe(false);
    expect(open(at('2026-11-21T15:30:00'), split)).toBe(false);
    expect(open(at('2026-11-21T17:00:00'), split)).toBe(true);
    expect(open(at('2026-11-21T20:30:00'), split)).toBe(false);
  });
  it('jam buka berikutnya, rentang hari & teks', async () => {
    const { nextOpenTime, hoursEnvelope, formatPeriods, openPeriods } = await import('../src/businessDate');
    expect(nextOpenTime(at('2026-11-21T15:00:00'), split)).toBe('17:00');
    expect(nextOpenTime(at('2026-11-21T21:00:00'), split)).toBe('08:00');
    expect(nextOpenTime(at('2026-11-21T10:00:00'), split)).toBeNull();
    expect(
      hoursEnvelope([
        { open: '17:00', close: '02:00' },
        { open: '08:00', close: '14:00' },
      ]),
    ).toEqual({
      open: '08:00',
      close: '02:00',
    });
    expect(formatPeriods(split)).toBe('08:00–14:00, 17:00–20:00');
    expect(openPeriods(hours)).toEqual([{ open: '08:00', close: '03:00' }]);
  });
  it('sesi malam lewat tengah malam (08–14 & 17–02) tetap satu hari operasional', async () => {
    const { isOpenAt: open } = await import('../src/businessDate');
    const late = {
      open: '08:00',
      close: '02:00',
      periods: [
        { open: '08:00', close: '14:00' },
        { open: '17:00', close: '02:00' },
      ],
    };
    expect(open(at('2026-11-22T01:00:00'), late)).toBe(true);
    expect(businessDate(at('2026-11-22T01:00:00'), late)).toBe('2026-11-21');
    expect(open(at('2026-11-22T03:00:00'), late)).toBe(false);
  });
});
