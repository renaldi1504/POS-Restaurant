import type { FastifyInstance } from 'fastify';
import { unauthorized } from '../../lib/errors';
import { JOB_NAMES } from '../../lib/jobs';
import { defineRoute } from '../../lib/route';
import { getTelegram, handleAdminJob, handleNotifyJob } from './service';

export default async function telegramRoutes(app: FastifyInstance) {
  defineRoute(app, 'telegramWebhook', async ({ req, body }) => {
    const secret = app.config.TELEGRAM_WEBHOOK_SECRET;
    if (secret && req.headers['x-telegram-bot-api-secret-token'] !== secret)
      throw unauthorized('Secret salah');
    const tg = getTelegram(app);
    if (tg.enabled) {
      // Balas cepat ke Telegram; proses di belakang.
      void tg
        .handleUpdate(body)
        .catch((err: unknown) => app.log.error({ err }, 'Gagal memproses update Telegram'));
    }
    return { ok: true as const };
  });

  if (app.jobs.enabled) {
    await app.jobs.work<Parameters<typeof handleNotifyJob>[1]>(JOB_NAMES.telegramNotify, (d) =>
      handleNotifyJob(app, d),
    );
    await app.jobs.work<Parameters<typeof handleAdminJob>[1]>(JOB_NAMES.telegramAdmin, (d) =>
      handleAdminJob(app, d),
    );
  }
}
