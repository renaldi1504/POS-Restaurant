import { describe, expect, it } from 'vitest';
import {
  ceilCash,
  convertMoney,
  DEFAULT_RATES,
  formatMoney,
  formatWithEquivalents,
  fromMinor,
  parseMoneyInput,
  percentOf,
  roundCash,
  sumInMain,
  toMinor,
} from '../src/money';

describe('formatMoney', () => {
  it('formats KHR with dot thousands and riel sign', () => {
    expect(formatMoney(42000, 'KHR')).toBe('42.000 ៛');
    expect(formatMoney(0, 'KHR')).toBe('0 ៛');
    expect(formatMoney(1234567, 'KHR')).toBe('1.234.567 ៛');
    expect(formatMoney(-500, 'KHR')).toBe('-500 ៛');
  });
  it('formats USD from cents', () => {
    expect(formatMoney(1025, 'USD')).toBe('$10.25');
    expect(formatMoney(5, 'USD')).toBe('$0.05');
    expect(formatMoney(123456789, 'USD')).toBe('$1,234,567.89');
    expect(formatMoney(-1025, 'USD')).toBe('-$10.25');
  });
  it('formats IDR', () => {
    expect(formatMoney(168000, 'IDR')).toBe('Rp 168.000');
  });
  it('supports signed & noSymbol', () => {
    expect(formatMoney(1000, 'KHR', { signed: true })).toBe('+1.000 ៛');
    expect(formatMoney(1000, 'KHR', { noSymbol: true })).toBe('1.000');
  });
});

describe('minor units', () => {
  it('converts major/minor', () => {
    expect(toMinor(10.25, 'USD')).toBe(1025);
    expect(toMinor(0.1 + 0.2, 'USD')).toBe(30);
    expect(fromMinor(1025, 'USD')).toBe(10.25);
    expect(toMinor(42000, 'KHR')).toBe(42000);
  });
});

describe('convertMoney', () => {
  it('USD ↔ KHR', () => {
    expect(convertMoney(1000, 'USD', 'KHR', DEFAULT_RATES)).toBe(41000);
    expect(convertMoney(41000, 'KHR', 'USD', DEFAULT_RATES)).toBe(1000);
    expect(convertMoney(42000, 'KHR', 'USD', DEFAULT_RATES)).toBe(1024); // 10.2439 → $10.24
  });
  it('IDR ↔ KHR (Rp1.000 = 250 ៛)', () => {
    expect(convertMoney(1000, 'IDR', 'KHR', DEFAULT_RATES)).toBe(250);
    expect(convertMoney(42000, 'KHR', 'IDR', DEFAULT_RATES)).toBe(168000);
  });
  it('USD ↔ IDR via KHR', () => {
    expect(convertMoney(100, 'USD', 'IDR', DEFAULT_RATES)).toBe(16400);
  });
  it('identity', () => {
    expect(convertMoney(123, 'USD', 'USD', DEFAULT_RATES)).toBe(123);
  });
  it('rejects invalid rates', () => {
    expect(() => convertMoney(100, 'USD', 'KHR', { USD: 0, IDR: 0.25 })).toThrow();
  });
});

describe('rounding & helpers', () => {
  it('roundCash KHR to 100', () => {
    expect(roundCash(10249, 'KHR')).toBe(10200);
    expect(roundCash(10250, 'KHR')).toBe(10300);
    expect(ceilCash(10201, 'KHR')).toBe(10300);
    expect(roundCash(1025, 'USD')).toBe(1025);
  });
  it('percentOf rounds half up', () => {
    expect(percentOf(42000, 10)).toBe(4200);
    expect(percentOf(10005, 10)).toBe(1001);
  });
  it('sumInMain', () => {
    expect(
      sumInMain(
        [
          { amount: 20000, currency: 'KHR' },
          { amount: 500, currency: 'USD' },
        ],
        'KHR',
        DEFAULT_RATES,
      ),
    ).toBe(40500);
  });
  it('formatWithEquivalents', () => {
    expect(formatWithEquivalents(41000, 'KHR', ['USD', 'IDR'], DEFAULT_RATES)).toBe(
      '41.000 ៛ ≈ $10.00 ≈ Rp 164.000',
    );
  });
  it('parseMoneyInput', () => {
    expect(parseMoneyInput('42.000', 'KHR')).toBe(42000);
    expect(parseMoneyInput('10.25', 'USD')).toBe(1025);
    expect(parseMoneyInput('10,5', 'USD')).toBe(1050);
    expect(parseMoneyInput('1,000', 'USD')).toBe(100000);
    expect(parseMoneyInput('', 'KHR')).toBeNull();
  });
});
