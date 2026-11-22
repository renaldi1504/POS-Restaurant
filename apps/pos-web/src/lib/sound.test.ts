import { describe, expect, it } from 'vitest';
import { SOUNDS } from './sound';

describe('bunyi notifikasi', () => {
  it('order online, dapur, dan driver punya bunyi yang berbeda', () => {
    const sig = (k: keyof typeof SOUNDS) => SOUNDS[k].map((n) => `${n.type}:${n.freq}:${n.dur}`).join('|');
    const all = [sig('order'), sig('kitchen'), sig('driver')];
    expect(new Set(all).size).toBe(3);
    expect(SOUNDS.order[0]!.type).not.toBe(SOUNDS.kitchen[0]!.type);
    // dapur: lonceng panjang dengan nada tambahan
    expect(SOUNDS.kitchen[0]!.partials?.length).toBeGreaterThan(0);
    expect(SOUNDS.kitchen[0]!.dur).toBeGreaterThan(SOUNDS.order[2]!.dur);
  });
});
