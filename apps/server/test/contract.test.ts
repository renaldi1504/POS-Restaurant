import { expect, it } from 'vitest';
import { endpoints } from '@pos/shared';
import { createTestApp } from './helpers';

it('every endpoint in the shared contract registry is implemented', async () => {
  const app = await createTestApp();
  await app.ready();
  const missing = Object.entries(endpoints)
    .filter(([, d]) => !app.hasRoute({ method: d.method, url: d.path }))
    .map(([k]) => k);
  expect(missing).toEqual([]);
  await app.close();
});
