import { defineConfig } from 'tsup';

// Bundle server + @pos/shared (TS source) menjadi ESM di dist/. Dependency npm lain tetap external.
export default defineConfig({
  entry: {
    index: 'src/index.ts',
    migrate: 'src/db/migrate.ts',
    seed: 'src/db/seed.ts',
  },
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  noExternal: ['@pos/shared'],
  splitting: false,
});
