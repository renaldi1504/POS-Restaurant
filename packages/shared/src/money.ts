import type { Currency } from './enums';

/**
 * Uang selalu disimpan sebagai bilangan bulat dalam satuan terkecil (minor units):
 * - KHR: riel (tanpa desimal)
 * - USD: sen (1 USD = 100)
 * - IDR: rupiah (tanpa desimal)
 */
export const CURRENCY_DECIMALS: Record<Currency, number> = { KHR: 0, USD: 2, IDR: 0 };
export const CURRENCY_SYMBOL: Record<Currency, string> = { KHR: '៛', USD: '$', IDR: 'Rp' };

/** Kurs: berapa KHR untuk 1 unit utama mata uang (USD: 4100 → $1 = 4.100 ៛; IDR: 0.25 → Rp1 = 0,25 ៛). */
export interface Rates {
  USD: number;
  IDR: number;
  KHR?: number;
}
export const DEFAULT_RATES: Rates = { USD: 4100, IDR: 0.25 };

export function minorFactor(currency: Currency): number {
  return 10 ** CURRENCY_DECIMALS[currency];
}

/** 10.25 (USD) → 1025 */
export function toMinor(major: number, currency: Currency): number {
  return Math.round(major * minorFactor(currency));
}

/** 1025 (USD) → 10.25 */
export function fromMinor(minor: number, currency: Currency): number {
  return minor / minorFactor(currency);
}

/** KHR per 1 unit UTAMA mata uang. */
export function khrPerUnit(currency: Currency, rates: Rates): number {
  if (currency === 'KHR') return 1;
  const r = rates[currency];
  if (!r || r <= 0) throw new Error(`Kurs ${currency} tidak valid`);
  return r;
}

/** Pembulatan "half away from zero" ke bilangan bulat. */
export function roundHalfUp(n: number): number {
  return n < 0 ? -Math.round(-n) : Math.round(n);
}

/**
 * Konversi jumlah minor antar mata uang lewat KHR, dibulatkan ke satuan minor terdekat.
 * convertMoney(1000, 'USD', 'KHR', {USD:4100, IDR:0.25}) → 41000  ($10.00 → 41.000 ៛)
 */
export function convertMoney(amountMinor: number, from: Currency, to: Currency, rates: Rates): number {
  if (from === to) return amountMinor;
  const khr = fromMinor(amountMinor, from) * khrPerUnit(from, rates);
  const targetMajor = khr / khrPerUnit(to, rates);
  return roundHalfUp(targetMajor * minorFactor(to));
}

/**
 * Pembulatan uang tunai: KHR ke 100 riel terdekat (pecahan terkecil yang beredar),
 * USD ke sen, IDR ke 100 rupiah. Dipakai untuk saran nominal/kembalian tunai, bukan untuk harga.
 */
export const CASH_ROUNDING: Record<Currency, number> = { KHR: 100, USD: 1, IDR: 100 };
export function roundCash(amountMinor: number, currency: Currency): number {
  const step = CASH_ROUNDING[currency];
  return roundHalfUp(amountMinor / step) * step;
}

/** Pembulatan ke atas (mis. jumlah yang harus dibayar tunai dalam mata uang lain). */
export function ceilCash(amountMinor: number, currency: Currency): number {
  const step = CASH_ROUNDING[currency];
  return Math.ceil(amountMinor / step) * step;
}

function groupThousands(intStr: string, sep: string): string {
  return intStr.replace(/\B(?=(\d{3})+(?!\d))/g, sep);
}

export interface FormatMoneyOptions {
  /** Tanpa simbol mata uang. */
  noSymbol?: boolean;
  /** Paksa tanda + untuk angka positif (mis. selisih). */
  signed?: boolean;
}

/**
 * Format tampilan:
 * - KHR → `42.000 ៛`
 * - USD → `$10.25`
 * - IDR → `Rp 168.000`
 */
export function formatMoney(amountMinor: number, currency: Currency, opts: FormatMoneyOptions = {}): string {
  const neg = amountMinor < 0;
  const abs = Math.abs(amountMinor);
  const sign = neg ? '-' : opts.signed && abs > 0 ? '+' : '';
  if (currency === 'USD') {
    const dollars = Math.floor(abs / 100);
    const cents = String(abs % 100).padStart(2, '0');
    const body = `${groupThousands(String(dollars), ',')}.${cents}`;
    return opts.noSymbol ? `${sign}${body}` : `${sign}$${body}`;
  }
  const body = groupThousands(String(abs), '.');
  if (opts.noSymbol) return `${sign}${body}`;
  if (currency === 'KHR') return `${sign}${body} ៛`;
  return `${sign}Rp ${body}`;
}

/** Tampilkan nilai KHR beserta perkiraan mata uang lain: `42.000 ៛ ≈ $10.24 ≈ Rp 168.000`. */
export function formatWithEquivalents(
  amountMinor: number,
  currency: Currency,
  others: Currency[],
  rates: Rates,
): string {
  const parts = [formatMoney(amountMinor, currency)];
  for (const c of others) {
    if (c === currency) continue;
    parts.push(`≈ ${formatMoney(convertMoney(amountMinor, currency, c, rates), c)}`);
  }
  return parts.join(' ');
}

/** Parse input pengguna ("42.000", "10.25", "10,25") ke minor units. Return null bila tidak valid. */
export function parseMoneyInput(input: string, currency: Currency): number | null {
  const s = input.trim().replace(/[^\d.,-]/g, '');
  if (!s) return null;
  let normalized: string;
  if (currency === 'USD') {
    // Untuk USD: titik/koma terakhir = desimal bila diikuti 1-2 digit
    const m = /^(-?[\d.,]*?)[.,](\d{1,2})$/.exec(s);
    normalized = m ? `${(m[1] ?? '').replace(/[.,]/g, '')}.${m[2]}` : s.replace(/[.,]/g, '');
  } else {
    normalized = s.replace(/[.,]/g, '');
  }
  const n = Number(normalized);
  if (!Number.isFinite(n)) return null;
  return toMinor(n, currency);
}

/** Jumlah semua pembayaran dalam mata uang utama. */
export function sumInMain(
  lines: { amount: number; currency: Currency }[],
  main: Currency,
  rates: Rates,
): number {
  return lines.reduce((acc, l) => acc + convertMoney(l.amount, l.currency, main, rates), 0);
}

/** Persentase → nilai (dibulatkan), mis. diskon 10% dari 42.000 → 4.200. */
export function percentOf(amountMinor: number, pct: number): number {
  return roundHalfUp((amountMinor * pct) / 100);
}
