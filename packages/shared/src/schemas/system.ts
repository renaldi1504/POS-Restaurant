import { z } from 'zod';
import { IsoDateTime } from './common';

export const HealthResponse = z.object({
  ok: z.boolean(),
  version: z.string(),
  time: IsoDateTime,
  db: z.boolean(),
});
export type HealthResponse = z.infer<typeof HealthResponse>;

/** Update Telegram (diteruskan ke grammY); bentuk bebas. */
export const TelegramUpdate = z.record(z.string(), z.unknown());
