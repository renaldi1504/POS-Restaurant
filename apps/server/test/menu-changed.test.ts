import type { FastifyInstance } from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import { broadcastMenuChanged } from '../src/modules/menu/routes';

describe('menu.changed', () => {
  it('perubahan menu beruntun digabung jadi satu event', async () => {
    vi.useFakeTimers();
    const emit = vi.fn();
    const app = { realtime: { io: { emit } } } as unknown as FastifyInstance;
    broadcastMenuChanged(app);
    broadcastMenuChanged(app);
    broadcastMenuChanged(app);
    expect(emit).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(350);
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit.mock.calls[0]![0]).toBe('menu.changed');
    vi.useRealTimers();
  });
});
