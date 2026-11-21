/** Persiapan data e2e: restoran buka 24 jam (test tidak tergantung jam), rekening ABA terisi. */
import { expect, test as setup } from '@playwright/test';
import { apiAs, json } from './helpers';

setup('settings e2e: buka 24 jam + rekening ABA', async () => {
  const owner = await apiAs('Owner');
  const res = await json<{ settings: { hours: { open: string; close: string } } }>(
    await owner.patch('/api/admin/settings', {
      data: {
        hours: { open: '00:00', close: '00:00', holidays: [] },
        payment: { aba: { accountName: 'RM BERKAT', accountNumber: '000 123 456' } },
      },
    }),
  );
  expect(res.settings.hours).toMatchObject({ open: '00:00', close: '00:00' });
  const pub = await json<{ isOpen: boolean }>(await owner.get('/api/public/settings'));
  expect(pub.isOpen).toBe(true);
  await owner.dispose();
});
