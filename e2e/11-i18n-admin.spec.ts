/**
 * Admin & kasir 4 bahasa: Owner memilih ខ្មែរ / 中文 di lembar Lainnya lalu menjelajah dashboard → kelola menu →
 * ubah menu → settings → pengguna. Teks Khmer/Mandarin tampil, tanpa sisa label Indonesia/Inggris.
 * Bahasa disimpan di akun (dipakai lagi saat login), lalu dikembalikan ke `id` supaya test lain tidak terpengaruh.
 */
import type { Page } from '@playwright/test';
import { apiAs, collectErrors, ensureShift, loginUI, POS } from './helpers';
import { expect, test } from './test';

async function setOwnerLang(lang: 'id' | 'en' | 'kh' | 'zh') {
  const owner = await apiAs('Owner');
  expect((await owner.patch('/api/auth/me/lang', { data: { lang } })).status()).toBe(200);
  await owner.dispose();
}

test.beforeAll(async () => {
  const kasir = await apiAs('Kasir Pagi');
  await ensureShift(kasir);
  await kasir.dispose();
});
test.afterEach(async () => setOwnerLang('id'));

/** Label yang TIDAK boleh tampil lagi (fallback Indonesia/Inggris). */
const FALLBACK = [
  'Kelola menu',
  'Manage menu',
  'Simpan perubahan',
  'Save changes',
  'Pengguna & role',
  'Users & roles',
  'Penjualan per jam',
  'Sales per hour',
  'Lainnya',
  'Rekening ABA',
  'Harga per channel',
  'Riel',
  'Dollar',
];

async function expectNoFallback(page: Page) {
  const text = await page.locator('body').innerText();
  for (const s of FALLBACK) expect(text, `teks "${s}" masih tampil`).not.toContain(s);
}

async function pickLang(page: Page, name: string) {
  await page.getByRole('button', { name: 'Lainnya' }).click();
  await page.getByTestId('lang-picker').getByRole('radio', { name }).click();
}

test('Owner ganti ke ខ្មែរ: dashboard → kelola menu → ubah menu → settings → pengguna', async ({ page }) => {
  const errors = collectErrors(page);
  await loginUI(page, 'Owner');
  await page.goto(`${POS}/admin`);
  await expect(page.getByRole('heading', { name: 'Penjualan', level: 1 })).toBeVisible();

  await pickLang(page, 'ភាសាខ្មែរ');
  await expect(page.locator('html')).toHaveAttribute('lang', 'km');
  await expect(page.getByRole('heading', { name: 'ផ្សេងៗ' })).toBeVisible();
  await page.keyboard.press('Escape');

  // Dashboard
  await expect(page.getByRole('heading', { name: 'ការលក់', level: 1 })).toBeVisible();
  await expect(page.getByText('ការលក់តាមម៉ោង')).toBeVisible();
  await expectNoFallback(page);

  // Kelola menu (lewat navigasi) → ubah "Ayam Goreng" (nama menu ikut Khmer)
  await page.getByRole('link', { name: 'គ្រប់គ្រងម៉ឺនុយ' }).click();
  await expect(page.getByRole('heading', { name: 'គ្រប់គ្រងម៉ឺនុយ', level: 1 })).toBeVisible();
  await expectNoFallback(page);
  await page
    .getByRole('button', { name: /^មាន់បំពង.*·/ })
    .first()
    .click();
  await expect(page.getByRole('heading', { name: /^កែ៖ មាន់បំពង/ })).toBeVisible();
  await expect(page.getByText('ឈ្មោះម្ហូប (4 ភាសា)')).toBeVisible();
  await expect(page.getByText(/^តម្លៃតាមប៉ុស្តិ៍/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'រក្សាទុក', exact: true })).toBeVisible();
  await expectNoFallback(page);

  // Settings
  await page.goto(`${POS}/admin/settings`);
  await expect(page.getByRole('heading', { name: 'ការកំណត់', level: 1 })).toBeVisible();
  await expect(page.getByText('គណនី ABA')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'ម៉ោងបើក' })).toBeVisible();
  await expect(page.getByText('រៀល ៛')).toBeVisible();
  await expectNoFallback(page);

  // Pengguna & role (nama role bawaan & izin diterjemahkan)
  await page.goto(`${POS}/admin/pengguna`);
  await expect(page.getByRole('heading', { name: 'អ្នកប្រើ & តួនាទី', level: 1 })).toBeVisible();
  await expect(page.getByText('អ្នកគិតលុយ').first()).toBeVisible();
  await page.getByRole('tab', { name: 'តួនាទី & សិទ្ធិ' }).click();
  await expect(page.getByText('បង្កើតការកុម្ម៉ង់').first()).toBeVisible();
  await expectNoFallback(page);

  // Disimpan di akun: login ulang di perangkat baru tetap Khmer.
  await page.context().clearCookies();
  await page.evaluate(() => localStorage.clear());
  await loginUI(page, 'Owner');
  await page.goto(`${POS}/admin`);
  await expect(page.getByRole('heading', { name: 'ការលក់', level: 1 })).toBeVisible();
  expect(errors).toEqual([]);
});

test('Owner ganti ke 中文: admin & kasir tanpa sisa teks Indonesia/Inggris', async ({ page }) => {
  const errors = collectErrors(page);
  await loginUI(page, 'Owner');
  await pickLang(page, '中文');
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-Hans');
  await page.keyboard.press('Escape');

  await page.goto(`${POS}/admin`);
  await expect(page.getByRole('heading', { name: '销售', level: 1 })).toBeVisible();
  await expect(page.getByText('每小时销售')).toBeVisible();
  await expectNoFallback(page);
  await page.goto(`${POS}/admin/menu`);
  await expect(page.getByRole('heading', { name: '菜单管理', level: 1 })).toBeVisible();
  await expectNoFallback(page);
  await page.goto(`${POS}/admin/settings`);
  await expect(page.getByRole('heading', { name: '营业时间' })).toBeVisible();
  await expect(page.getByText('瑞尔 ៛')).toBeVisible();
  await expectNoFallback(page);
  await page.goto(`${POS}/admin/pengguna`);
  await expect(page.getByText('收银员').first()).toBeVisible();
  await expectNoFallback(page);
  await page.goto(`${POS}/kasir`);
  await expect(page.getByRole('link', { name: '收银' }).first()).toBeVisible();
  await expectNoFallback(page);
  expect(errors).toEqual([]);
});

test('layar login: pilih ខ្មែរ sebelum masuk (per perangkat)', async ({ page }) => {
  await page.goto(`${POS}/login`);
  await page.getByRole('radio', { name: 'ភាសាខ្មែរ' }).click();
  await expect(page.getByRole('heading', { name: 'អ្នកណាចូល?' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'អ្នកណាចូល?' })).toBeVisible();
  await page.getByRole('radio', { name: 'Bahasa Indonesia' }).click();
  await expect(page.getByRole('heading', { name: 'Siapa yang masuk?' })).toBeVisible();
});
