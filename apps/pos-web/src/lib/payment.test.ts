import { describe, expect, it } from 'vitest';
import { computeChange, evenShares, exactAmount, quickCashOptions, splitRemaining } from './payment';

const rates = { USD: 4100, IDR: 0.25 };

describe('hitungan bayar', () => {
  it('kembalian dalam Riel dari uang KHR / USD / IDR', () => {
    expect(computeChange(42000, 100000, 'KHR', 'KHR', rates)).toEqual({
      receivedMain: 100000,
      changeMain: 58000,
      shortMain: 0,
      enough: true,
    });
    expect(computeChange(42000, 2000, 'USD', 'KHR', rates).changeMain).toBe(40000); // $20 = 82.000
    expect(computeChange(42000, 200000, 'IDR', 'KHR', rates).changeMain).toBe(8000); // Rp200.000 = 50.000
    const short = computeChange(42000, 20000, 'KHR', 'KHR', rates);
    expect(short.enough).toBe(false);
    expect(short.shortMain).toBe(22000);
  });

  it('uang pas dibulatkan ke atas sesuai pecahan & tidak kurang setelah konversi', () => {
    expect(exactAmount(42000, 'KHR', 'KHR', rates)).toBe(42000);
    expect(exactAmount(42050, 'KHR', 'KHR', rates)).toBe(42100);
    expect(exactAmount(42000, 'KHR', 'USD', rates)).toBe(1025); // $10.25
    expect(exactAmount(42000, 'KHR', 'IDR', rates)).toBe(168000);
  });

  it('tombol uang cepat lebih besar dari uang pas', () => {
    expect(quickCashOptions(42000, 'KHR')).toEqual([50000, 100000, 200000]);
    expect(quickCashOptions(1025, 'USD')).toEqual([1500, 2000, 5000]);
    expect(quickCashOptions(0, 'KHR')[0]).toBe(50000);
  });

  it('split: sisa & kembalian', () => {
    const r = splitRemaining(
      42000,
      [
        { id: 1, method: 'cash', currency: 'KHR', amount: 20000 },
        { id: 2, method: 'aba', currency: 'KHR', amount: null },
      ],
      'KHR',
      rates,
    );
    expect(r.remainingMain).toBe(22000);
    expect(
      splitRemaining(42000, [{ id: 1, method: 'cash', currency: 'USD', amount: 1100 }], 'KHR', rates)
        .changeMain,
    ).toBe(3100);
  });

  it('bagi rata: jumlah bagian = total', () => {
    const s = evenShares(62000, 3, 'KHR');
    expect(s).toEqual([20700, 20700, 20600]);
    expect(s.reduce((a, b) => a + b, 0)).toBe(62000);
  });
});
