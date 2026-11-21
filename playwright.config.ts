import { defineConfig, devices } from '@playwright/test';

/**
 * E2E memakai Chrome sistem (/usr/bin/google-chrome, channel 'chrome') — tidak mengunduh browser.
 * webServer: server API (DB pos_e2e di-reset & di-seed) + pos-web + order-web (Vite dev, port khusus e2e).
 */
const API_PORT = 3101;
const POS_PORT = 5183;
const ORDER_PORT = 5184;
const E2E_DB = process.env.E2E_DATABASE_URL ?? 'postgres://pos:pos@localhost:5432/pos_e2e';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${POS_PORT}`,
    channel: 'chrome',
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    locale: 'id-ID',
    timezoneId: 'Asia/Phnom_Penh',
    trace: 'retain-on-failure',
  },
  projects: [
    // Persiapan data sekali per run (jam buka 24 jam, rekening ABA) — setelah webServer menyala.
    { name: 'setup', testMatch: /global\.setup\.ts/ },
    {
      name: 'mobile-chrome',
      dependencies: ['setup'],
      grepInvert: /@tablet-only/,
      use: { ...devices['Pixel 7'], channel: 'chrome', viewport: { width: 390, height: 844 } },
    },
    // Tablet landscape (SKILL §8b): alur kasir, dapur, driver, kelola menu & web pelanggan (tag @tablet).
    {
      name: 'tablet',
      dependencies: ['setup'],
      grep: /@tablet/,
      use: {
        ...devices['Desktop Chrome'],
        channel: 'chrome',
        viewport: { width: 1024, height: 768 },
        deviceScaleFactor: 1,
        hasTouch: true,
      },
    },
  ],
  webServer: [
    {
      command: 'pnpm --filter @pos/server e2e:server',
      url: `http://localhost:${API_PORT}/api/health`,
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: 'pipe',
      env: {
        NODE_ENV: 'development',
        PORT: String(API_PORT),
        DATABASE_URL: E2E_DB,
        E2E_DATABASE_URL: E2E_DB,
        JOBS_ENABLED: 'false',
        RATE_LIMIT_ENABLED: 'false',
        TRANSLATE_FREE_ENABLED: 'false',
        GEOCODE_OSM_ENABLED: 'false',
        LOG_LEVEL: 'warn',
        POS_ORIGIN: `http://localhost:${POS_PORT}`,
        ORDER_ORIGIN: `http://localhost:${ORDER_PORT}`,
        UPLOAD_DIR: './uploads-e2e',
      },
    },
    {
      command: `pnpm --filter @pos/pos-web exec vite --port ${POS_PORT} --strictPort`,
      url: `http://localhost:${POS_PORT}`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: { VITE_API_TARGET: `http://localhost:${API_PORT}` },
    },
    {
      command: `pnpm --filter @pos/order-web exec vite --port ${ORDER_PORT} --strictPort`,
      url: `http://localhost:${ORDER_PORT}`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: { VITE_API_TARGET: `http://localhost:${API_PORT}` },
    },
  ],
});
