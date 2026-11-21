/** Hitungan layar Bayar: uang pas, tombol uang cepat, kembalian (dalam mata uang utama). */
import { ceilCash, convertMoney, KHR_QUICK_CASH, type Currency, type Rates } from '@pos/shared';

/** Jumlah tunai minimal dalam `currency` untuk melunasi `dueMain` (dibulatkan ke atas ke pecahan terkecil). */
export function exactAmount(dueMain: number, main: Currency, currency: Currency, rates: Rates): number {
  if (dueMain <= 0) return 0;
  if (currency === main) return ceilCash(dueMain, currency);
  // Konversi lalu bulatkan ke atas; pastikan nilai balik ke main tidak kurang (pembulatan kurs).
  let amt = ceilCash(convertMoney(dueMain, main, currency, rates), currency);
  while (convertMoney(amt, currency, main, rates) < dueMain) amt += currency === 'USD' ? 1 : 100;
  return amt;
}

const QUICK: Record<Currency, readonly number[]> = {
  KHR: KHR_QUICK_CASH,
  USD: [500, 1_000, 2_000, 5_000, 10_000],
  IDR: [50_000, 100_000, 200_000, 500_000, 1_000_000],
};
const ROUND_STEP: Record<Currency, number[]> = {
  KHR: [10_000, 50_000, 100_000],
  USD: [500, 1_000, 2_000],
  IDR: [10_000, 50_000, 100_000],
};

/** Tombol uang cepat (> uang pas), maksimal `max`, urut naik. */
export function quickCashOptions(exact: number, currency: Currency, max = 3): number[] {
  const set = new Set<number>();
  for (const v of QUICK[currency]) if (v > exact) set.add(v);
  for (const step of ROUND_STEP[currency]) {
    const r = Math.ceil(exact / step) * step;
    if (r > exact) set.add(r);
  }
  return [...set].sort((a, b) => a - b).slice(0, max);
}

export interface ChangeResult {
  receivedMain: number;
  changeMain: number;
  /** Kekurangan (mata uang utama); 0 bila cukup. */
  shortMain: number;
  enough: boolean;
}

export function computeChange(
  dueMain: number,
  received: number | null,
  currency: Currency,
  main: Currency,
  rates: Rates,
): ChangeResult {
  const receivedMain = received ? convertMoney(received, currency, main, rates) : 0;
  const diff = receivedMain - dueMain;
  return {
    receivedMain,
    changeMain: Math.max(0, diff),
    shortMain: Math.max(0, -diff),
    enough: diff >= 0 && receivedMain > 0,
  };
}

export interface SplitLine {
  id: number;
  method: 'cash' | 'aba';
  currency: Currency;
  amount: number | null;
}

/** Sisa yang belum ditutup oleh baris split (mata uang utama, ≥ 0) & kembalian (bila cash berlebih). */
export function splitRemaining(
  dueMain: number,
  lines: SplitLine[],
  main: Currency,
  rates: Rates,
): { paidMain: number; remainingMain: number; changeMain: number } {
  const paidMain = lines.reduce(
    (a, l) => a + (l.amount ? convertMoney(l.amount, l.currency, main, rates) : 0),
    0,
  );
  return {
    paidMain,
    remainingMain: Math.max(0, dueMain - paidMain),
    changeMain: Math.max(0, paidMain - dueMain),
  };
}

/** Bagi rata: bagian per orang (dibulatkan ke atas ke 100 riel), orang terakhir menutup sisa. */
export function evenShares(totalMain: number, people: number, main: Currency): number[] {
  const n = Math.max(1, Math.floor(people));
  const share = ceilCash(Math.ceil(totalMain / n), main);
  const out: number[] = [];
  let left = totalMain;
  for (let i = 0; i < n; i++) {
    const v = i === n - 1 ? left : Math.min(share, left);
    out.push(Math.max(0, v));
    left -= v;
  }
  return out;
}
