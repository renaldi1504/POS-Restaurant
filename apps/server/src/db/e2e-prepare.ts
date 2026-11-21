/**
 * Siapkan DB e2e (default pos_e2e): buat bila belum ada, reset, migrasi, seed.
 * Dipanggil Playwright sebelum menyalakan server e2e.
 */
import pg from 'pg';
import { createDb } from './client';
import { resetDatabase, runMigrations } from './migrate-lib';
import { seedDatabase } from './seed-data';

const url = process.env.E2E_DATABASE_URL ?? 'postgres://pos:pos@localhost:5432/pos_e2e';
const dbName = new URL(url).pathname.slice(1);
const admin = new URL(url);
admin.pathname = '/postgres';

const client = new pg.Client({ connectionString: admin.toString() });
await client.connect();
const exists = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
if (!exists.rowCount) await client.query(`CREATE DATABASE "${dbName.replace(/"/g, '')}"`);
await client.end();

await resetDatabase(url);
await runMigrations(url);
const { db, pool } = createDb(url, { max: 2 });
await seedDatabase(db);
await pool.end();
console.log(`✓ DB e2e siap: ${dbName}`);
