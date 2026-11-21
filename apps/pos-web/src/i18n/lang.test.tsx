/**
 * Bahasa staf (4 bahasa): pemilih di lembar Lainnya & layar login, simpan per perangkat + per akun,
 * `<html lang>`, bahasa akun dipakai saat login, halaman admin tampil penuh dalam Khmer & Mandarin,
 * error server diterjemahkan, tanggal mengikuti bahasa.
 */
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import {
  PERMISSION_KEYS,
  type AdminUserDto,
  type LoginUserCard,
  type RoleDto,
  type StaffUser,
} from '@pos/shared';
import { ApiError } from '@pos/shared/client';
import { Screen } from '../components/common';
import { errorMessage } from '../lib/api';
import { formatDayLabel } from '../lib/format';
import i18n, { setLang } from '../lib/i18n';
import LoginPage from '../pages/LoginPage';
import UsersPage from '../pages/admin/UsersPage';
import { fx } from '../test/fixtures';
import { renderApp } from '../test/render';
import { http, HttpResponse, server } from '../test/server';

const owner: StaffUser = {
  id: 1,
  name: 'Owner',
  lang: 'id',
  role: { id: 1, name: 'Owner' },
  permissions: [...PERMISSION_KEYS],
};

describe('pemilih bahasa di lembar Lainnya (semua staf)', () => {
  it('kasir memilih ខ្មែរ → UI Khmer, <html lang="km">, disimpan di perangkat & akun', async () => {
    const saved: string[] = [];
    server.use(
      http.patch('*/api/auth/me/lang', async ({ request }) => {
        const { lang } = (await request.json()) as { lang: StaffUser['lang'] };
        saved.push(lang);
        return HttpResponse.json({ user: { ...fx.cashier, lang } });
      }),
    );
    renderApp(
      <Screen testId="screen">
        <h1>Layar</h1>
      </Screen>,
      { route: '/kasir' },
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Lainnya' }));
    const picker = screen.getByTestId('lang-picker');
    expect(within(picker).getByRole('radio', { name: 'Bahasa Indonesia' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await userEvent.click(within(picker).getByRole('radio', { name: 'ភាសាខ្មែរ' }));

    await waitFor(() => expect(saved).toEqual(['kh']));
    expect(localStorage.getItem('pos.lang')).toBe('kh');
    expect(document.documentElement.lang).toBe('km');
    // judul lembar, menu & tombol keluar langsung Khmer
    expect(screen.getByRole('heading', { name: 'ផ្សេងៗ' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ចាកចេញ' })).toBeInTheDocument();
    expect(screen.queryByText('Semua menu')).not.toBeInTheDocument();
    // nama role bawaan ikut diterjemahkan
    expect(screen.getByText(/អ្នកគិតលុយ/)).toBeInTheDocument();

    await userEvent.click(within(screen.getByTestId('lang-picker')).getByRole('radio', { name: '中文' }));
    await waitFor(() => expect(saved).toEqual(['kh', 'zh']));
    expect(document.documentElement.lang).toBe('zh-Hans');
    expect(screen.getByRole('heading', { name: '更多' })).toBeInTheDocument();
  });

  it('gagal menyimpan ke server → bahasa tetap berganti di perangkat + pesan dalam bahasa baru', async () => {
    server.use(http.patch('*/api/auth/me/lang', () => HttpResponse.json({}, { status: 500 })));
    renderApp(<Screen testId="screen">x</Screen>, { route: '/kasir' });
    await userEvent.click(await screen.findByRole('button', { name: 'Lainnya' }));
    await userEvent.click(within(screen.getByTestId('lang-picker')).getByRole('radio', { name: '中文' }));
    expect(await screen.findByText('语言未能保存到服务器，请重试')).toBeInTheDocument();
    expect(localStorage.getItem('pos.lang')).toBe('zh');
  });
});

describe('layar login', () => {
  const cards: LoginUserCard[] = [
    { id: 2, name: 'Kasir Pagi', roleId: 2, roleName: 'Kasir', initials: 'KP', locked: false },
    { id: 5, name: 'Driver', roleId: 4, roleName: 'Driver', initials: 'DR', locked: false },
  ];
  const loginHandlers = (patched: string[]) => [
    http.get('*/api/auth/me', () =>
      HttpResponse.json({ error: { code: 'UNAUTHORIZED', message: 'x' } }, { status: 401 }),
    ),
    http.get('*/api/auth/users', () => HttpResponse.json({ users: cards })),
    http.patch('*/api/auth/me/lang', () => {
      patched.push('x');
      return HttpResponse.json({});
    }),
  ];

  it('pilih bahasa sebelum login: hanya disimpan di perangkat (tanpa API akun)', async () => {
    const patched: string[] = [];
    server.use(...loginHandlers(patched));
    renderApp(<LoginPage />);
    expect(await screen.findByRole('heading', { name: 'Siapa yang masuk?' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('radio', { name: '中文' }));
    expect(screen.getByRole('heading', { name: '谁要登录？' })).toBeInTheDocument();
    expect(screen.getByText('收银员')).toBeInTheDocument(); // role "Kasir"
    expect(localStorage.getItem('pos.lang')).toBe('zh');
    expect(patched).toEqual([]);
  });

  it('setelah login, bahasa milik akun yang dipakai (driver → ខ្មែរ)', async () => {
    setLang('zh');
    server.use(
      ...loginHandlers([]),
      http.post('*/api/auth/pin', () =>
        HttpResponse.json({ user: fx.driver, expiresAt: new Date(Date.now() + 3600_000).toISOString() }),
      ),
    );
    renderApp(<LoginPage />);
    await userEvent.click(await screen.findByRole('button', { name: /Driver/ }));
    for (const d of '4444') await userEvent.click(screen.getByRole('button', { name: d }));
    await userEvent.click(screen.getByRole('button', { name: '登录' }));
    await waitFor(() => expect(i18n.language).toBe('kh'));
    expect(document.documentElement.lang).toBe('km');
    expect(localStorage.getItem('pos.lang')).toBe('kh');
  });
});

describe('halaman admin Pengguna & role dalam Khmer dan Mandarin', () => {
  const users: AdminUserDto[] = [
    {
      id: 1,
      name: 'Owner',
      role: { id: 1, name: 'Owner' },
      lang: 'id',
      active: true,
      system: false,
      lockedUntil: null,
      failedAttempts: 0,
    },
    {
      id: 2,
      name: 'Kasir Pagi',
      role: { id: 2, name: 'Kasir' },
      lang: 'id',
      active: true,
      system: false,
      lockedUntil: null,
      failedAttempts: 0,
    },
    {
      id: 5,
      name: 'Driver',
      role: { id: 4, name: 'Driver' },
      lang: 'kh',
      active: true,
      system: false,
      lockedUntil: null,
      failedAttempts: 0,
    },
  ];
  const roles: RoleDto[] = [
    { id: 1, name: 'Owner', permissions: [...PERMISSION_KEYS], system: true, userCount: 1 },
    { id: 2, name: 'Kasir', permissions: ['order.create', 'payment.create'], system: true, userCount: 1 },
  ];
  const setup = () =>
    server.use(
      http.get('*/api/auth/me', () => HttpResponse.json({ user: owner })),
      http.get('*/api/admin/users', () => HttpResponse.json({ users })),
      http.get('*/api/admin/roles', () => HttpResponse.json({ roles })),
    );

  const cases = [
    {
      lang: 'kh' as const,
      title: 'អ្នកប្រើ & តួនាទី',
      cashierRole: 'អ្នកគិតលុយ',
      rolesTab: 'តួនាទី & សិទ្ធិ',
      perm: 'បង្កើតការកុម្ម៉ង់',
      addUser: 'បន្ថែមអ្នកប្រើ',
    },
    {
      lang: 'zh' as const,
      title: '用户与角色',
      cashierRole: '收银员',
      rolesTab: '角色与权限',
      perm: '创建订单',
      addUser: '添加用户',
    },
  ];
  for (const c of cases) {
    it(`${c.lang}: judul, role, tab, izin & tombol tanpa teks Indonesia/Inggris`, async () => {
      setLang(c.lang);
      setup();
      renderApp(<UsersPage />);
      expect(await screen.findByRole('heading', { name: c.title })).toBeInTheDocument();
      expect(await screen.findByText(c.cashierRole)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: new RegExp(c.addUser) })).toBeInTheDocument();
      for (const id of [
        'Pengguna & role',
        'Users & roles',
        'Tambah pengguna',
        'Add user',
        'Kasir',
        'Cashier',
      ])
        expect(screen.queryByText(id)).not.toBeInTheDocument();

      await userEvent.click(screen.getByRole('tab', { name: c.rolesTab }));
      expect((await screen.findAllByText(c.perm)).length).toBeGreaterThan(0);
      expect(screen.queryByText('Buat order')).not.toBeInTheDocument();
      expect(screen.queryByText('Create orders')).not.toBeInTheDocument();
    });
  }
});

describe('pesan error & tanggal mengikuti bahasa', () => {
  const t = (lng: string) => i18n.getFixedT(lng);
  it('alasan spesifik dari pesan server diterjemahkan (kh/zh), kode sebagai cadangan', () => {
    const e = new ApiError(409, 'CONFLICT', 'Kategori masih berisi menu');
    expect(errorMessage(e, t('id'))).toBe('Kategori masih berisi menu');
    expect(errorMessage(e, t('kh'))).toBe('ប្រភេទនេះនៅមានម្ហូប');
    expect(errorMessage(e, t('zh'))).toBe('分类下还有菜品');
    const dyn = new ApiError(400, 'VALIDATION_ERROR', 'Mata uang USD tidak aktif');
    expect(errorMessage(dyn, t('zh'))).toBe('货币 USD 未启用');
    const tr = new ApiError(422, 'INVALID_TRANSITION', 'Status tidak bisa diubah dari ready ke cooking');
    expect(errorMessage(tr, t('en'))).toBe('Status cannot change from Ready to Cooking');
    const unknown = new ApiError(409, 'CONFLICT', 'pesan baru yang belum terdaftar');
    expect(errorMessage(unknown, t('kh'))).toBe('ទិន្នន័យជាន់គ្នា សូមផ្ទុកឡើងវិញ');
    expect(errorMessage(new Error('localErr.notConnected'), t('zh'))).toBe('打印机未连接');
  });

  it('tanggal: nama hari & bulan lokal, angka tetap Latin', () => {
    expect(formatDayLabel('2026-11-21', 'id')).toMatch(/Sab.*21.*Nov/);
    expect(formatDayLabel('2026-11-21', 'en')).toMatch(/Sat.*21.*Nov/);
    expect(formatDayLabel('2026-11-21', 'kh')).toMatch(/21/);
    expect(formatDayLabel('2026-11-21', 'kh')).toMatch(/វិច្ឆិកា/);
    expect(formatDayLabel('2026-11-21', 'kh')).not.toMatch(/[០-៩]/);
    expect(formatDayLabel('2026-11-21', 'zh')).toMatch(/11月21日/);
    // Browser tanpa data ICU Khmer (Chrome): nama hari/bulan dari kamus sendiri, bukan locale perangkat.
    expect(formatDayLabel('2026-11-21', 'kh', { supports: () => false })).toBe('សៅរ៍ 21 វិច្ឆិកា');
    expect(formatDayLabel('2026-01-04', 'kh', { supports: () => false, weekday: false })).toBe('4 មករា');
  });
});
