import type pg from 'pg';
import type { AppConfig } from './config';
import type { Db } from './db/client';
import type { Jobs } from './lib/jobs';
import type { CustomerContext, StaffContext } from './lib/session';
import type { Storage } from './lib/storage';
import type { Realtime } from './realtime';

declare module 'fastify' {
  interface FastifyInstance {
    config: AppConfig;
    db: Db;
    pool: pg.Pool;
    realtime: Realtime;
    storage: Storage;
    jobs: Jobs;
  }
  interface FastifyRequest {
    staff: StaffContext | null;
    customer: CustomerContext | null;
  }
  interface FastifyContextConfig {
    /** Lewati validasi respons (mis. stream). */
    skipResponseValidation?: boolean;
  }
}
