import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, vi } from 'vitest';
import i18n from '../lib/i18n';
import { resetDb, server } from './server';

vi.mock('../lib/socket', () => import('./socketMock'));

// fetch relatif ('/api/...') → absolut terhadap origin jsdom (Node fetch butuh URL lengkap).
beforeAll(() => {
  // Ukuran HP (compact) secara default; test tablet mengubah innerWidth sendiri.
  Object.defineProperty(window, 'innerWidth', { value: 390, writable: true, configurable: true });
  server.listen({ onUnhandledRequest: 'error' });
  const patched = globalThis.fetch;
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) =>
    patched(
      typeof input === 'string' && input.startsWith('/')
        ? new URL(input, window.location.origin).href
        : input,
      init,
    )) as typeof fetch;
  if (typeof URL.createObjectURL !== 'function') {
    URL.createObjectURL = () => 'blob:mock';
    URL.revokeObjectURL = () => undefined;
  }
  window.scrollTo = () => undefined;
});

beforeEach(async () => {
  resetDb();
  await i18n.changeLanguage('id');
});

afterEach(async () => {
  cleanup();
  server.resetHandlers();
  try {
    sessionStorage.clear();
    localStorage.clear();
  } catch {
    /* abaikan */
  }
  const { cartStore } = await import('../lib/cart');
  const { checkoutStore } = await import('../lib/checkout');
  cartStore.setScope('online');
  cartStore.reload();
  checkoutStore.reset();
  delete window.Telegram;
});

afterAll(() => server.close());
