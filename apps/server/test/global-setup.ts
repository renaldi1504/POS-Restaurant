/**
 * Sekali sebelum semua test: kosongkan DB test, jalankan migrasi, lalu seed.
 */
import { createDb } from '../src/db/client';
import { resetDatabase, runMigrations } from '../src/db/migrate-lib';
import { seedDatabase } from '../src/db/seed-data';

export default async function setup() {
  const url = process.env.TEST_DATABASE_URL ?? 'postgres://pos:pos@localhost:5432/pos_test';
  await resetDatabase(url);
  await runMigrations(url);
  const { db, pool } = createDb(url, { max: 2 });
  await seedDatabase(db);
  await pool.end();
}
