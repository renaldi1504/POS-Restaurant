import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createDb } from './client';

/** Cari folder drizzle/ baik saat jalan dari src (tsx) maupun dari dist (bundle). */
export function migrationsDir(): string {
  if (process.env.MIGRATIONS_DIR) return process.env.MIGRATIONS_DIR;
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(here, '../../drizzle'),
    path.resolve(here, '../drizzle'),
    path.resolve(process.cwd(), 'drizzle'),
  ];
  const found = candidates.find((p) => existsSync(path.join(p, 'meta', '_journal.json')));
  if (!found) throw new Error(`Folder migrasi tidak ditemukan (dicoba: ${candidates.join(', ')})`);
  return found;
}

export async function runMigrations(url: string): Promise<void> {
  const { db, pool } = createDb(url, { max: 1 });
  try {
    await migrate(db, { migrationsFolder: migrationsDir() });
  } finally {
    await pool.end();
  }
}

/** Hapus semua isi DB (schema public + drizzle + pgboss). HANYA untuk dev/test. */
export async function resetDatabase(url: string): Promise<void> {
  const { pool } = createDb(url, { max: 1 });
  try {
    await pool.query('DROP SCHEMA IF EXISTS public CASCADE');
    await pool.query('DROP SCHEMA IF EXISTS drizzle CASCADE');
    await pool.query('DROP SCHEMA IF EXISTS pgboss CASCADE');
    await pool.query('CREATE SCHEMA public');
  } finally {
    await pool.end();
  }
}
