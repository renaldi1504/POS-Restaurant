import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, vi } from 'vitest';
import '../lib/i18n';
import { server } from './server';
import { resetPrefs } from '../lib/prefs';
import { clearCart } from '../lib/cart';

// Socket.IO tiruan: tidak ada koneksi jaringan; test bisa memicu event lewat `emitSocket()`.
vi.mock('socket.io-client', async () => {
  const { fakeIo } = await import('./fakeSocket');
  return { io: fakeIo };
});

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
  // API client memakai URL relatif ('/api/...'); fetch Node butuh URL absolut.
  const patched = globalThis.fetch;
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) =>
    patched(typeof input === 'string' && input.startsWith('/') ? new URL(input, window.location.origin).toString() : input, init)) as typeof fetch;
});
afterEach(() => {
  cleanup();
  server.resetHandlers();
  localStorage.clear();
  resetPrefs();
  clearCart();
  sessionStorage.clear();
});
afterAll(() => server.close());
