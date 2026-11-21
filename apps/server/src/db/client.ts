import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema';

export type Schema = typeof schema;
export type Db = NodePgDatabase<Schema>;
/** Transaksi Drizzle (parameter callback `db.transaction`). */
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
/** Db atau transaksi — service sebaiknya menerima ini. */
export type DbOrTx = Db | Tx;

// bigint (int8) → number (aman untuk nilai uang di sini); date tetap string 'YYYY-MM-DD'.
pg.types.setTypeParser(20, (v) => Number(v));
pg.types.setTypeParser(1082, (v) => v);

export function createDb(url: string, opts: { max?: number } = {}) {
  const pool = new pg.Pool({ connectionString: url, max: opts.max ?? 10 });
  const db = drizzle(pool, { schema, casing: undefined });
  return { db, pool };
}

export { schema };
