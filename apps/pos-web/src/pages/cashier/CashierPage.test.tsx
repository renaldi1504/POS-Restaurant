import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderApp } from '../../test/render';
import { http, HttpResponse, server } from '../../test/server';
import { fx } from '../../test/fixtures';
import CashierPage from './CashierPage';

describe('Kasir – pilih menu', () => {
  it('shift terbuka: layar kasir dengan menu, badge jumlah, menu habis disabled, bar bawah', async () => {
    renderApp(<CashierPage />, { route: '/kasir', path: '/kasir' });
    expect(screen.getByTestId('cashier-screen')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Kasir' })).toBeInTheDocument();
    const tea = await screen.findByRole('button', { name: /^Es Teh Manis/ });
    expect(screen.getByRole('button', { name: /^Pempek Lenjer/ })).toBeDisabled();
    await userEvent.click(tea);
    await userEvent.click(tea);
    expect(screen.getByRole('button', { name: /Es Teh Manis.*2 di keranjang/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Lihat pesanan/ })).toHaveTextContent('8.000 ៛');
    // menu dengan opsi membuka lembar opsi
    await userEvent.click(screen.getByRole('button', { name: /^Ayam Goreng/ }));
    expect(within(screen.getByRole('dialog')).getByText('Bagian ayam')).toBeInTheDocument();
  });

  it('pencarian lintas bahasa & kategori', async () => {
    renderApp(<CashierPage />, { route: '/kasir', path: '/kasir' });
    await screen.findByRole('button', { name: /^Es Teh Manis/ });
    await userEvent.type(screen.getByRole('searchbox', { name: 'Cari menu…' }), 'fried');
    expect(screen.getByRole('button', { name: /^Ayam Goreng/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Es Teh Manis/ })).not.toBeInTheDocument();
  });

  it('belum ada shift: tampil form Buka shift di layar kasir', async () => {
    server.use(http.get('*/api/shifts/current', () => HttpResponse.json({ shift: null })));
    renderApp(<CashierPage />, { route: '/kasir', path: '/kasir' });
    expect(await screen.findByRole('heading', { name: /Buka Shift/ })).toBeInTheDocument();
    expect(screen.getByTestId('cashier-screen')).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole('button', { name: 'Tambah 100.000 ៛' })[0]!);
    expect(screen.getByTestId('opening-total')).toHaveTextContent('100.000 ៛');
  });

  it('pintasan Pengeluaran (kasir) & Dashboard (hanya dengan izin laporan)', async () => {
    renderApp(<CashierPage />, { route: '/kasir', path: '/kasir' });
    expect(await screen.findByRole('button', { name: 'Pengeluaran' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Dashboard/ })).not.toBeInTheDocument();
  });

  it('pintasan Dashboard tampil bila role punya izin Lihat laporan', async () => {
    server.use(
      http.get('*/api/auth/me', () =>
        HttpResponse.json({
          user: { ...fx.cashier, permissions: [...fx.cashier.permissions, 'reports.view'] },
        }),
      ),
    );
    renderApp(<CashierPage />, { route: '/kasir', path: '/kasir' });
    expect(await screen.findByRole('button', { name: /Dashboard/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pengeluaran' })).toBeInTheDocument();
  });
});
