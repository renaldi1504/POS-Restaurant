import { sql } from 'drizzle-orm';
import { loadConfig } from '../config';
import { createDb } from './client';
import { roles } from './schema';
import { seedDatabase } from './seed-data';

const config = loadConfig();
const { db, pool } = createDb(config.DATABASE_URL, { max: 2 });
const force = process.argv.includes('--force');
const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(roles);
if ((row?.n ?? 0) > 0 && !force) {
  console.log('• Data sudah ada, seed dilewati. Pakai `pnpm db:reset` untuk mengulang dari nol.');
} else {
  await seedDatabase(db, { orderOrigin: config.ORDER_ORIGIN });
  console.log(
    '✓ Seed selesai. Login: Owner 1234, Kasir Pagi 1111, Kasir Malam 2222, Dapur 3333, Driver 4444',
  );
}
await pool.end();
