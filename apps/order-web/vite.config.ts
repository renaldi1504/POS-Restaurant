/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '../../', '');
  const target = process.env.VITE_API_TARGET ?? env.VITE_API_TARGET ?? 'http://localhost:3000';
  return {
    envDir: '../../',
    plugins: [react(), tailwindcss()],
    server: {
      port: 5174,
      strictPort: true,
      proxy: {
        '/api': { target, changeOrigin: false },
        '/uploads': { target, changeOrigin: false },
        '/ws': { target, ws: true, changeOrigin: false },
      },
    },
    preview: { port: 4174 },
    build: {
      target: 'es2020',
      sourcemap: true,
      rollupOptions: {
        output: {
          manualChunks: {
            react: ['react', 'react-dom', 'react-router'],
            data: ['@tanstack/react-query', 'zod', 'socket.io-client'],
            i18n: ['i18next', 'react-i18next'],
          },
        },
      },
    },
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      include: ['src/**/*.test.{ts,tsx}'],
      css: false,
    },
  };
});
