import { describe, expect, it } from 'vitest';
import { closingPreview } from '../test/fixtures';
import { closingCalc, diffKind } from './closing';

describe('hitungan closing', () => {
  it('cash dihitung (semua mata uang → KHR) dibanding seharusnya', () => {
    const c = closingCalc(closingPreview, { KHR: 1033000, USD: 2000, IDR: 0 }, 555000, 'KHR', { USD: 4100, IDR: 0.25 });
    expect(c.cashActualMain).toBe(1115000);
    expect(c.cashDiff).toBe(-5000);
    expect(c.abaDiff).toBe(0);
    expect(c.needsNote).toBe(true);
    expect(c.cashSalesMain).toBe(858000);
    expect(diffKind(c.cashDiff)).toBe('short');
    expect(diffKind(0)).toBe('match');
  });
});
