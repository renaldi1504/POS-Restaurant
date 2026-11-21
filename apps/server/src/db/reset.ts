import { loadConfig } from '../config';
import { resetDatabase, runMigrations } from './migrate-lib';
import { createDb } from './client';
import { seedDatabase } from './seed-data';

const config = loadConfig();
if (config.isProd) throw new Error('db:reset dilarang di production');
await resetDatabase(config.DATABASE_URL);
await runMigrations(config.DATABASE_URL);
const { db, pool } = createDb(config.DATABASE_URL, { max: 2 });
await seedDatabase(db, { orderOrigin: config.ORDER_ORIGIN });
await pool.end();
console.log('✓ Database direset, dimigrasi & di-seed');
