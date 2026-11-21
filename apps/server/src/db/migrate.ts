import { loadConfig } from '../config';
import { runMigrations } from './migrate-lib';

const config = loadConfig();
await runMigrations(config.DATABASE_URL);
console.log('✓ Migrasi selesai');
