import { describe, expect, it } from 'vitest';
import {
  canTransition,
  initialStatusFor,
  nextStatuses,
  ORDER_STATUSES,
  ORDER_TRANSITIONS,
} from '../src/enums';

describe('order transitions', () => {
  it('delivery happy path', () => {
    const path = [
      'pending_accept',
      'accepted',
      'cooking',
      'ready',
      'picked_up',
      'delivered',
      'done',
    ] as const;
    for (let i = 0; i < path.length - 1; i++)
      expect(canTransition(path[i]!, path[i + 1]!, 'delivery')).toBe(true);
  });
  it('dine-in / takeaway happy path', () => {
    for (const type of ['dine_in', 'takeaway'] as const) {
      const path = ['accepted', 'cooking', 'ready', 'served', 'done'] as const;
      for (let i = 0; i < path.length - 1; i++)
        expect(canTransition(path[i]!, path[i + 1]!, type)).toBe(true);
    }
  });
  it('type rules', () => {
    expect(canTransition('ready', 'served', 'delivery')).toBe(false);
    expect(canTransition('ready', 'picked_up', 'dine_in')).toBe(false);
    expect(canTransition('picked_up', 'ready', 'delivery')).toBe(true); // driver melepas
  });
  it('terminal states have no exits', () => {
    for (const s of ['done', 'rejected', 'cancelled'] as const) expect(ORDER_TRANSITIONS[s]).toHaveLength(0);
  });
  it('cannot go backwards or skip', () => {
    expect(canTransition('cooking', 'accepted', 'dine_in')).toBe(false);
    expect(canTransition('pending_accept', 'cooking', 'delivery')).toBe(false);
    expect(canTransition('done', 'cancelled', 'dine_in')).toBe(false);
    expect(canTransition('rejected', 'accepted', 'delivery')).toBe(false);
  });
  it('every status is in the map', () => {
    for (const s of ORDER_STATUSES) expect(ORDER_TRANSITIONS[s]).toBeDefined();
  });
  it('nextStatuses filters by type', () => {
    expect(nextStatuses('ready', 'delivery')).toEqual(['picked_up', 'cancelled']);
    expect(nextStatuses('ready', 'takeaway')).toEqual(['served', 'cancelled']);
  });
  it('initial status', () => {
    expect(initialStatusFor('kasir', { qrRequireAccept: true })).toBe('accepted');
    expect(initialStatusFor('telegram', { qrRequireAccept: false })).toBe('pending_accept');
    expect(initialStatusFor('qr', { qrRequireAccept: true })).toBe('pending_accept');
    expect(initialStatusFor('qr', { qrRequireAccept: false })).toBe('accepted');
  });
});
