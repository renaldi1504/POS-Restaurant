import { BUSINESS_TIMEZONE } from './enums';

export interface BusinessHours {
  /** "HH:MM" */
  open: string;
  /** "HH:MM" — boleh lebih kecil dari open (lewat tengah malam, mis. 03:00). */
  close: string;
}

export interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number; // 0 = Minggu
}

const dtfCache = new Map<string, Intl.DateTimeFormat>();
function dtf(tz: string): Intl.DateTimeFormat {
  let f = dtfCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      weekday: 'short',
    });
    dtfCache.set(tz, f);
  }
  return f;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Bagian tanggal/jam lokal pada zona waktu tertentu. */
export function zonedParts(date: Date, tz: string = BUSINESS_TIMEZONE): ZonedParts {
  const parts = dtf(tz).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '0';
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    hour: Number(get('hour')) % 24,
    minute: Number(get('minute')),
    second: Number(get('second')),
    weekday: WEEKDAYS.indexOf(get('weekday')),
  };
}

export function parseHHMM(s: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (!m) throw new Error(`Format jam tidak valid: ${s}`);
  return Number(m[1]) * 60 + Number(m[2]);
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function formatYMD(y: number, m: number, d: number): string {
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** Tambah/kurangi hari pada string YYYY-MM-DD. */
export function addDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return formatYMD(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

/** Apakah jam operasional melewati tengah malam (close <= open, mis. 08:00–03:00). */
export function crossesMidnight(hours: BusinessHours): boolean {
  return parseHHMM(hours.close) <= parseHHMM(hours.open);
}

/**
 * Hari operasional (`business_date`, YYYY-MM-DD) untuk waktu `date`.
 * Bila jam operasional melewati tengah malam (08:00–03:00), waktu sebelum jam tutup
 * (00:00–02:59) dihitung sebagai hari sebelumnya. Waktu antara tutup dan buka (03:00–07:59)
 * dihitung sebagai hari kalender itu sendiri.
 */
export function businessDate(date: Date, hours: BusinessHours, tz: string = BUSINESS_TIMEZONE): string {
  const p = zonedParts(date, tz);
  const today = formatYMD(p.year, p.month, p.day);
  if (!crossesMidnight(hours)) return today;
  const minutes = p.hour * 60 + p.minute;
  if (minutes < parseHHMM(hours.close)) return addDays(today, -1);
  return today;
}

/** Offset zona waktu (menit, lokal − UTC) pada instant tertentu. */
export function tzOffsetMinutes(date: Date, tz: string = BUSINESS_TIMEZONE): number {
  const p = zonedParts(date, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000);
}

/** Konversi waktu lokal (zona tz) → Date UTC. */
export function zonedTimeToUtc(ymd: string, hhmm: string, tz: string = BUSINESS_TIMEZONE): Date {
  const [y, m, d] = ymd.split('-').map(Number) as [number, number, number];
  const mins = parseHHMM(hhmm);
  const guess = new Date(Date.UTC(y, m - 1, d, Math.floor(mins / 60), mins % 60));
  const off = tzOffsetMinutes(guess, tz);
  const first = new Date(guess.getTime() - off * 60000);
  const off2 = tzOffsetMinutes(first, tz);
  return off2 === off ? first : new Date(guess.getTime() - off2 * 60000);
}

/**
 * Rentang waktu [start, end) satu hari operasional dalam UTC.
 * start = jam tutup hari sebelumnya untuk jadwal lewat tengah malam supaya semua transaksi tercakup:
 * untuk 08:00–03:00 → [D 03:00, D+1 03:00). Untuk jadwal biasa → [D 00:00, D+1 00:00).
 */
export function businessDayRange(
  ymd: string,
  hours: BusinessHours,
  tz: string = BUSINESS_TIMEZONE,
): { start: Date; end: Date } {
  const boundary = crossesMidnight(hours) ? hours.close : '00:00';
  return { start: zonedTimeToUtc(ymd, boundary, tz), end: zonedTimeToUtc(addDays(ymd, 1), boundary, tz) };
}

/** Apakah restoran buka pada `date` (mengikuti jam & daftar libur YYYY-MM-DD). */
export function isOpenAt(
  date: Date,
  hours: BusinessHours & { holidays?: string[] },
  tz: string = BUSINESS_TIMEZONE,
): boolean {
  const bd = businessDate(date, hours, tz);
  if (hours.holidays?.includes(bd)) return false;
  const p = zonedParts(date, tz);
  const minutes = p.hour * 60 + p.minute;
  const open = parseHHMM(hours.open);
  const close = parseHHMM(hours.close);
  if (open === close) return true; // 24 jam
  if (close > open) return minutes >= open && minutes < close;
  return minutes >= open || minutes < close;
}

/** Jam lokal (0–23) pada zona bisnis — untuk grafik penjualan per jam. */
export function localHour(date: Date, tz: string = BUSINESS_TIMEZONE): number {
  return zonedParts(date, tz).hour;
}
