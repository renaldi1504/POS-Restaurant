import { describe, expect, it } from 'vitest';
import { currentClose, reopenTime, sessionsText } from './menu';

const hours = {
  open: '08:00',
  close: '20:00',
  periods: [
    { open: '08:00', close: '14:00' },
    { open: '17:00', close: '20:00' },
  ],
  nextOpen: null,
};
// Asia/Phnom_Penh = UTC+7.
const at = (hhmm: string) => new Date(`2026-11-22T${hhmm}:00+07:00`);

describe('jam buka beberapa sesi', () => {
  it('jam tutup = akhir sesi yang sedang berjalan', () => {
    expect(currentClose(hours, at('10:30'))).toBe('14:00');
    expect(currentClose(hours, at('18:00'))).toBe('20:00');
    // Di luar sesi → jam tutup terakhir.
    expect(currentClose(hours, at('15:00'))).toBe('20:00');
  });

  it('buka lagi: nextOpen bila ada, selain itu jam buka pertama', () => {
    expect(reopenTime({ ...hours, nextOpen: '17:00' })).toBe('17:00');
    expect(reopenTime(hours)).toBe('08:00');
  });

  it('daftar sesi hanya bila ≥ 2', () => {
    expect(sessionsText(hours, 'id')).toBe('08.00–14.00 · 17.00–20.00');
    expect(sessionsText({ ...hours, periods: [{ open: '08:00', close: '03:00' }] }, 'en')).toBeNull();
  });
});
