import { z } from 'zod';

const emptyToUndefined = (v: unknown) => (v === '' ? undefined : v);
const optionalString = z.preprocess(emptyToUndefined, z.string().optional());
const bool = (def: boolean) =>
  z.preprocess(
    (v) => (v === undefined || v === '' ? def : v === 'true' || v === '1' || v === true),
    z.boolean(),
  );

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(3000),
  HOST: z.string().default('0.0.0.0'),
  DATABASE_URL: z.string().default('postgres://pos:pos@localhost:5432/pos'),
  TEST_DATABASE_URL: z.string().default('postgres://pos:pos@localhost:5432/pos_test'),
  SESSION_SECRET: z
    .string()
    .min(32, 'SESSION_SECRET minimal 32 karakter')
    .default('dev-secret-dev-secret-dev-secret-0000'),
  SESSION_TTL_HOURS: z.coerce.number().positive().default(16),
  CUSTOMER_SESSION_TTL_DAYS: z.coerce.number().positive().default(30),
  POS_ORIGIN: z.string().default('http://localhost:5173'),
  ORDER_ORIGIN: z.string().default('http://localhost:5174'),
  TZ_BUSINESS: z.string().default('Asia/Phnom_Penh'),
  JOBS_ENABLED: bool(true),
  RATE_LIMIT_ENABLED: bool(true),
  LOG_LEVEL: z.string().default('info'),

  TELEGRAM_BOT_TOKEN: optionalString,
  TELEGRAM_BOT_USERNAME: optionalString,
  TELEGRAM_ADMIN_CHAT_ID: optionalString,
  TELEGRAM_WEBHOOK_SECRET: optionalString,

  GEMINI_API_KEY: optionalString,
  GEMINI_MODEL: z.string().default('gemini-2.5-flash'),
  /** Opsional: email untuk kuota terjemahan gratis MyMemory lebih besar (50.000 karakter/hari). */
  TRANSLATE_EMAIL: optionalString,
  /** Terjemahan gratis MyMemory bila Gemini tidak ada/gagal (matikan di e2e agar tidak ke internet). */
  TRANSLATE_FREE_ENABLED: bool(true),

  GOOGLE_MAPS_API_KEY: optionalString,
  /** Alamat dari GPS via OpenStreetMap (gratis) bila Google tidak ada/gagal; matikan di e2e/test. */
  GEOCODE_OSM_ENABLED: bool(true),

  R2_ACCOUNT_ID: optionalString,
  R2_ACCESS_KEY_ID: optionalString,
  R2_SECRET_ACCESS_KEY: optionalString,
  R2_BUCKET_PUBLIC: optionalString,
  R2_BUCKET_PRIVATE: optionalString,
  R2_PUBLIC_URL: optionalString,
  UPLOAD_DIR: z.string().default('./uploads'),
});

export type Env = z.infer<typeof EnvSchema>;

export interface AppConfig extends Env {
  isProd: boolean;
  isTest: boolean;
  /** Integrasi aktif bila key terisi; selain itu mode mock/disabled. */
  features: {
    telegram: boolean;
    gemini: boolean;
    maps: boolean;
    r2: boolean;
  };
}

export function loadConfig(overrides: Partial<Record<keyof Env, unknown>> = {}): AppConfig {
  const parsed = EnvSchema.safeParse({ ...process.env, ...overrides });
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Konfigurasi .env tidak valid:\n${msg}`);
  }
  const env = parsed.data;
  if (env.NODE_ENV === 'production' && env.SESSION_SECRET.startsWith('dev-secret')) {
    throw new Error('SESSION_SECRET wajib diganti di production');
  }
  return {
    ...env,
    isProd: env.NODE_ENV === 'production',
    isTest: env.NODE_ENV === 'test',
    features: {
      telegram: !!env.TELEGRAM_BOT_TOKEN,
      gemini: !!env.GEMINI_API_KEY,
      maps: !!env.GOOGLE_MAPS_API_KEY,
      r2: !!(env.R2_ACCOUNT_ID && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY && env.R2_BUCKET_PUBLIC),
    },
  };
}
