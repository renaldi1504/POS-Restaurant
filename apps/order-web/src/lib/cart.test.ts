import { beforeEach, describe, expect, it } from 'vitest';
import { cartStore, lineKey } from './cart';

describe('cart store', () => {
  beforeEach(() => cartStore.clear());
  it('merges identical lines and keeps option order irrelevant', () => {
    cartStore.add({ itemId: 1, qty: 1, optionIds: [3, 1] });
    cartStore.add({ itemId: 1, qty: 2, optionIds: [1, 3] });
    expect(cartStore.get()).toHaveLength(1);
    expect(cartStore.get()[0]?.qty).toBe(3);
    expect(cartStore.get()[0]?.key).toBe(lineKey(1, [1, 3]));
  });
  it('setQty 0 removes the line', () => {
    cartStore.add({ itemId: 2, qty: 1 });
    cartStore.setQty(lineKey(2, []), 0);
    expect(cartStore.get()).toHaveLength(0);
  });
  it('toOrderItems', () => {
    cartStore.add({ itemId: 5, qty: 2, optionIds: [9], note: 'tanpa es' });
    expect(cartStore.toOrderItems()).toEqual([{ itemId: 5, qty: 2, optionIds: [9], note: 'tanpa es' }]);
  });
});
