/**
 * Jam server yang bisa diganti di test (business_date rollover, jam buka).
 *   clock.set(new Date('2026-01-01T10:00:00+07:00')); … clock.reset();
 */
let override: (() => Date) | null = null;

export const clock = {
  now(): Date {
    return override ? override() : new Date();
  },
  set(date: Date | (() => Date)): void {
    override = typeof date === 'function' ? date : () => new Date(date.getTime());
  },
  reset(): void {
    override = null;
  },
};

export const now = (): Date => clock.now();
