/**
 * Navigation bar adaptif (SKILL §8 / §8b): tujuan sesuai permission, badge realtime dari query yang ada,
 * lembar "Lainnya" (pin / lepas pin), rail kiri di tablet (tidak pernah bersamaan dengan bar bawah).
 */
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import type { StaffUser, TableStatusDto } from '@pos/shared';
import { renderApp } from '../../test/render';
import { fx, makeDriverOrder, makeOrder } from '../../test/fixtures';
import { http, HttpResponse, server } from '../../test/server';
import { resetNavSession } from '../../lib/navSession';
import { sizeClassFor } from '../../lib/windowSize';
import { Screen } from './Layout';

const table = (id: number, status: TableStatusDto['status']): TableStatusDto => ({
  id,
  name: `Meja ${id}`,
  area: 'Dalam',
  seats: 4,
  active: true,
  status,
  session: null,
  runningTotal: 0,
  pendingQrCount: status === 'qr_new' ? 1 : 0,
  orderCount: 0,
});

function asUser(user: StaffUser) {
  server.use(http.get('*/api/auth/me', () => HttpResponse.json({ user })));
}

function setWidth(w: number) {
  act(() => {
    window.innerWidth = w;
    window.dispatchEvent(new Event('resize'));
  });
}

function renderAt(route: string) {
  return renderApp(
    <Screen testId="screen">
      <h1>Layar</h1>
    </Screen>,
    { route, path: '*' },
  );
}

afterEach(() => {
  resetNavSession();
  setWidth(390);
});

describe('NavigationBar (HP)', () => {
  it('kasir: 4 tujuan default + Lainnya, aktif = rute sekarang, tanpa tujuan admin', async () => {
    asUser(fx.cashier);
    renderAt('/kasir');
    const nav = await screen.findByRole('navigation', { name: 'Navigasi utama' });
    const links = within(nav).getAllByRole('link');
    expect(links.map((l) => l.getAttribute('aria-label'))).toEqual([
      'Kasir',
      'Denah meja',
      'Order online',
      'Riwayat order',
    ]);
    expect(within(nav).getByRole('link', { name: 'Kasir' })).toHaveAttribute('aria-current', 'page');
    expect(within(nav).getByRole('button', { name: 'Lainnya' })).toBeInTheDocument();
    expect(screen.queryByTestId('navigation-rail')).toBeNull();
    expect(within(nav).queryByRole('link', { name: /Dashboard|Settings|Kelola menu/ })).toBeNull();
  });

  it('dapur: hanya Layar dapur & Printer (tidak ada tujuan admin/kasir)', async () => {
    asUser(fx.kitchen);
    renderAt('/dapur');
    const nav = await screen.findByRole('navigation', { name: 'Navigasi utama' });
    expect(
      within(nav)
        .getAllByRole('link')
        .map((l) => l.getAttribute('aria-label')),
    ).toEqual(['Layar dapur', 'Printer & suara']);
    await userEvent.click(within(nav).getByRole('button', { name: 'Lainnya' }));
    const sheet = await screen.findByRole('dialog', { name: 'Lainnya' });
    const all = within(sheet).getByRole('navigation', { name: 'Semua menu' });
    expect(within(all).queryByRole('button', { name: /Kasir|Dashboard|Settings|Pengguna/ })).toBeNull();
    expect(within(all).getByRole('button', { name: 'Layar dapur' })).toBeInTheDocument();
  });

  it('badge: order online baru, meja (QR / minta bill), siap diantar', async () => {
    const owner: StaffUser = {
      ...fx.cashier,
      id: 1,
      name: 'Owner',
      role: { id: 1, name: 'Owner' },
      permissions: [...fx.cashier.permissions, 'driver.deliver'],
    };
    asUser(owner);
    server.use(
      http.get('*/api/orders', () =>
        HttpResponse.json({
          orders: [
            makeOrder({
              id: '22222222-2222-4222-8222-222222222222',
              channel: 'website',
              status: 'pending_accept',
              createdByStaff: false,
            }),
            makeOrder({
              id: '33333333-3333-4333-8333-333333333333',
              channel: 'telegram',
              status: 'pending_accept',
              createdByStaff: false,
            }),
          ],
          serverTime: new Date().toISOString(),
        }),
      ),
      http.get('*/api/tables', () =>
        HttpResponse.json({ tables: [table(1, 'qr_new'), table(2, 'bill_requested'), table(3, 'eating')] }),
      ),
      http.get('*/api/driver/available', () => HttpResponse.json({ orders: [makeDriverOrder()] })),
    );
    renderAt('/kasir');
    const nav = await screen.findByRole('navigation', { name: 'Navigasi utama' });
    expect(await within(nav).findByRole('link', { name: 'Order online, 2 baru' })).toBeInTheDocument();
    expect(await within(nav).findByRole('link', { name: 'Denah meja, 2 baru' })).toBeInTheDocument();
    // Driver tidak termasuk 4 slot → titik merah di Lainnya, angka tampil di lembar.
    await userEvent.click(within(nav).getByRole('button', { name: 'Lainnya' }));
    const sheet = await screen.findByRole('dialog', { name: 'Lainnya' });
    const driverRow = within(sheet).getByRole('button', { name: 'Aplikasi driver' });
    await waitFor(() => expect(driverRow).toHaveTextContent('1'));
  });

  it('Lainnya: sematkan menu → langsung di slot pertama & tersimpan per user; lepas sematan', async () => {
    asUser(fx.cashier);
    renderAt('/kasir');
    const nav = await screen.findByRole('navigation', { name: 'Navigasi utama' });
    await userEvent.click(within(nav).getByRole('button', { name: 'Lainnya' }));
    const sheet = await screen.findByRole('dialog', { name: 'Lainnya' });
    await userEvent.click(within(sheet).getByRole('button', { name: 'Sematkan Pengeluaran' }));
    expect(within(sheet).getByRole('button', { name: 'Lepas sematan Pengeluaran' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(within(nav).getAllByRole('link')[0]).toHaveAccessibleName('Pengeluaran');
    expect(JSON.parse(localStorage.getItem(`pos.navUsage.${fx.cashier.id}`)!).pins).toEqual([
      '/kasir/pengeluaran',
    ]);
    await userEvent.click(within(sheet).getByRole('button', { name: 'Lepas sematan Pengeluaran' }));
    expect(within(nav).getAllByRole('link')[0]).toHaveAccessibleName('Kasir');
    expect(within(sheet).getByRole('button', { name: 'Keluar' })).toBeInTheDocument();
    expect(within(sheet).getByRole('switch', { name: /Bunyi/ })).toBeInTheDocument();
  });

  it('tidak tampil di alur fokus / layar detail', async () => {
    asUser(fx.cashier);
    renderAt('/kasir/bayar/abc');
    expect(await screen.findByRole('heading', { name: 'Layar' })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('navigation', { name: 'Navigasi utama' })).toBeNull());
  });
});

describe('ukuran jendela (tablet)', () => {
  it('kelas ukuran M3', () => {
    expect(sizeClassFor(360)).toBe('compact');
    expect(sizeClassFor(599)).toBe('compact');
    expect(sizeClassFor(600)).toBe('medium');
    expect(sizeClassFor(839)).toBe('medium');
    expect(sizeClassFor(840)).toBe('expanded');
    expect(sizeClassFor(1280)).toBe('expanded');
  });

  it('≥ 600px: navigation rail di kiri dengan tujuan yang sama, bar bawah tidak tampil', async () => {
    asUser(fx.cashier);
    setWidth(1024);
    renderAt('/kasir/meja');
    const rail = await screen.findByTestId('navigation-rail');
    expect(screen.queryByTestId('navigation-bar')).toBeNull();
    expect(
      within(rail)
        .getAllByRole('link')
        .map((l) => l.getAttribute('aria-label')),
    ).toEqual(['Kasir', 'Denah meja', 'Order online', 'Riwayat order']);
    expect(within(rail).getByRole('link', { name: 'Denah meja' })).toHaveAttribute('aria-current', 'page');
    // Kembali ke HP → bar bawah, rail hilang.
    setWidth(390);
    expect(await screen.findByTestId('navigation-bar')).toBeInTheDocument();
    expect(screen.queryByTestId('navigation-rail')).toBeNull();
  });
});
