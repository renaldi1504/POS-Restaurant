/**
 * Antrian background (pg-boss, tabel di schema `pgboss` pada DB yang sama — tanpa Redis).
 * Mati bila JOBS_ENABLED=false (test): `enqueue` jadi no-op yang dicatat ke log.
 *
 *   await app.jobs.enqueue(JOB_NAMES.telegramNotify, { orderId }, { retryLimit: 3 });
 *   await app.jobs.work(JOB_NAMES.telegramNotify, async (data) => { ... });
 */
import type { FastifyBaseLogger } from 'fastify';
import { PgBoss } from 'pg-boss';
import type { AppConfig } from '../config';

export const JOB_NAMES = {
  /** Kirim notifikasi status order ke chat Telegram pelanggan (retry 3x). */
  telegramNotify: 'telegram-notify',
  /** Teruskan bukti bayar / pertanyaan ke grup admin Telegram. */
  telegramAdmin: 'telegram-admin',
  /** Bersihkan sesi kedaluwarsa. */
  cleanupSessions: 'cleanup-sessions',
} as const;
export type JobName = (typeof JOB_NAMES)[keyof typeof JOB_NAMES];

export interface EnqueueOptions {
  retryLimit?: number;
  retryDelay?: number;
  startAfter?: number | Date;
  singletonKey?: string;
}

export interface Jobs {
  readonly enabled: boolean;
  enqueue(name: JobName, data: object, opts?: EnqueueOptions): Promise<void>;
  work<T extends object>(name: JobName, handler: (data: T) => Promise<void>): Promise<void>;
  stop(): Promise<void>;
  /** Job yang di-enqueue saat antrian mati (berguna di test). */
  readonly disabledLog: { name: JobName; data: object }[];
}

export async function createJobs(config: AppConfig, log: FastifyBaseLogger, url: string): Promise<Jobs> {
  const disabledLog: { name: JobName; data: object }[] = [];
  if (!config.JOBS_ENABLED) {
    return {
      enabled: false,
      disabledLog,
      async enqueue(name, data) {
        disabledLog.push({ name, data });
        log.debug({ name }, 'jobs disabled: enqueue diabaikan');
      },
      async work() {},
      async stop() {},
    };
  }
  const boss = new PgBoss({ connectionString: url, max: 3 });
  boss.on('error', (err) => log.error({ err }, 'pg-boss error'));
  await boss.start();
  for (const name of Object.values(JOB_NAMES)) await boss.createQueue(name);
  return {
    enabled: true,
    disabledLog,
    async enqueue(name, data, opts = {}) {
      await boss.send(name, data, {
        retryLimit: opts.retryLimit ?? 3,
        retryDelay: opts.retryDelay ?? 10,
        ...opts,
      });
    },
    async work(name, handler) {
      await boss.work(name, async (jobs) => {
        for (const job of jobs) await handler(job.data as never);
      });
    },
    async stop() {
      await boss.stop({ graceful: true, timeout: 5000 });
    },
  };
}
