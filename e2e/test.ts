/** `test` e2e: semua halaman memblokir sumber luar (font/SDK Telegram) yang tidak bisa dijangkau di CI. */
import { test as base } from '@playwright/test';
import { blockExternal } from './helpers';

export const test = base.extend<{ blockExternalAuto: void }>({
  blockExternalAuto: [
    async ({ context }, use) => {
      await blockExternal(context);
      await use();
    },
    { auto: true },
  ],
});
export { expect } from '@playwright/test';
