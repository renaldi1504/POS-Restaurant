import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    globalSetup: ['./test/global-setup.ts'],
    setupFiles: ['./test/setup-env.ts'],
    // Test integrasi berbagi satu DB pos_test → jalankan file berurutan.
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 60000,
  },
});
