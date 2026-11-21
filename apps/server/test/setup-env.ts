import os from 'node:os';
import path from 'node:path';

process.env.NODE_ENV = 'test';
process.env.JOBS_ENABLED = 'false';
process.env.RATE_LIMIT_ENABLED = 'false';
process.env.TEST_DATABASE_URL ??= 'postgres://pos:pos@localhost:5432/pos_test';
process.env.UPLOAD_DIR = path.join(os.tmpdir(), 'pos-test-uploads');
// Integrasi luar selalu mode mock saat test.
for (const k of ['TELEGRAM_BOT_TOKEN', 'GEMINI_API_KEY', 'GOOGLE_MAPS_API_KEY', 'R2_ACCOUNT_ID'])
  delete process.env[k];
