import { describe, expect, it } from 'vitest';
import {
  computeLineTotal,
  isSelectionComplete,
  toggleOption,
  validateOptionSelection,
  type OptionGroupLike,
} from '../src/options';

const bagian: OptionGroupLike = {
  id: 1,
  required: true,
  minSelect: 1,
  maxSelect: 1,
  options: [
    { id: 11, available: true, priceDelta: 0 },
    { id: 12, available: true, priceDelta: 0 },
  ],
};
const pedas: OptionGroupLike = {
  id: 2,
  required: true,
  minSelect: 1,
  maxSelect: 1,
  options: [
    { id: 21, available: true, priceDelta: 0 },
    { id: 22, available: true, priceDelta: 1000 },
  ],
};
const tambahan: OptionGroupLike = {
  id: 3,
  required: false,
  minSelect: 0,
  maxSelect: 3,
  options: [
    { id: 31, available: true, priceDelta: 2000 },
    { id: 32, available: true, priceDelta: 3000 },
    { id: 33, available: true, priceDelta: 1000 },
    { id: 34, available: true, priceDelta: 2000 },
    { id: 35, available: false, priceDelta: 2000 },
  ],
};
const groups = [bagian, pedas, tambahan];

describe('validateOptionSelection', () => {
  it('accepts a valid selection and sums price deltas', () => {
    const r = validateOptionSelection(groups, [11, 22, 31, 32]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.priceDelta).toBe(6000);
  });
  it('requires required groups', () => {
    const r = validateOptionSelection(groups, [11]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors).toEqual([{ code: 'required', groupId: 2, limit: 1 }]);
  });
  it('enforces max', () => {
    const r = validateOptionSelection(groups, [11, 21, 31, 32, 33, 34]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors).toContainEqual({ code: 'max', groupId: 3, limit: 3 });
  });
  it('enforces max 1 on single-choice', () => {
    const r = validateOptionSelection(groups, [11, 12, 21]);
    expect(!r.ok && r.errors.some((e) => e.code === 'max' && e.groupId === 1)).toBe(true);
  });
  it('rejects unavailable options', () => {
    const r = validateOptionSelection(groups, [11, 21, 35]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors).toContainEqual({ code: 'unavailable', groupId: 3, optionId: 35 });
  });
  it('rejects unknown & duplicate options', () => {
    const r = validateOptionSelection(groups, [11, 21, 999, 21]);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors).toContainEqual({ code: 'unknown_option', groupId: null, optionId: 999 });
      expect(r.errors).toContainEqual({ code: 'duplicate', groupId: 2, optionId: 21 });
    }
  });
  it('enforces min on optional groups with minSelect', () => {
    const g: OptionGroupLike = { ...tambahan, minSelect: 2 };
    const r = validateOptionSelection([g], [31]);
    expect(!r.ok && r.errors[0]?.code).toBe('min');
    expect(validateOptionSelection([g], []).ok).toBe(false);
  });
  it('no groups + no selection = ok', () => {
    expect(validateOptionSelection([], []).ok).toBe(true);
  });
  it('maxSelect 0 = unlimited', () => {
    const g: OptionGroupLike = { ...tambahan, maxSelect: 0 };
    expect(validateOptionSelection([g], [31, 32, 33, 34]).ok).toBe(true);
  });
  it('isSelectionComplete', () => {
    expect(isSelectionComplete(groups, [11])).toBe(false);
    expect(isSelectionComplete(groups, [11, 21])).toBe(true);
  });
});

describe('toggleOption', () => {
  it('radio behaviour for max 1', () => {
    expect(toggleOption(bagian, [11, 21], 12)).toEqual([21, 12]);
  });
  it('toggles off', () => {
    expect(toggleOption(tambahan, [31, 32], 31)).toEqual([32]);
  });
  it('does not exceed max', () => {
    expect(toggleOption(tambahan, [31, 32, 33], 34)).toEqual([31, 32, 33]);
  });
  it('ignores unavailable', () => {
    expect(toggleOption(tambahan, [], 35)).toEqual([]);
  });
});

it('computeLineTotal', () => {
  expect(computeLineTotal(10000, 3000, 2)).toBe(26000);
});
