import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { TABLE_TOKEN } from './fixtures';
import { renderApp } from './render';
import { db } from './server';

describe('mode meja (/m/:qrToken)', () => {
  it('banner meja, tipe dikunci makan di sini, kirim ke dapur berulang, minta bill', async () => {
    const user = userEvent.setup();
    renderApp(`/m/${TABLE_TOKEN}`);
    const banner = await screen.findByTestId('table-banner');
    expect(banner).toHaveTextContent('Meja 5 · Makan di sini');
    expect(banner).toHaveTextContent('Belum ada pesanan · bayar di kasir');
    expect(screen.getByTestId('order-menu')).toHaveAttribute('data-mode', 'table');
    expect(screen.queryByRole('radiogroup', { name: 'Tipe pesanan' })).toBeNull();
    expect(db.calls).toContainEqual(
      expect.objectContaining({ path: '/api/public/session/table', body: { qrToken: TABLE_TOKEN } }),
    );

    await screen.findByRole('heading', { name: 'Paling laris' });
    await user.click(within(screen.getByTestId('item-9')).getByRole('button', { name: 'Tambah Kerupuk' }));
    expect(screen.getByTestId('cart-bar')).toHaveTextContent('Kirim ke dapur');
    await user.click(screen.getByTestId('cart-bar'));

    const cartPage = await screen.findByTestId('cart-page');
    const send = within(cartPage).getByRole('button', { name: /Kirim ke dapur/ });
    expect(screen.getByText('Makan di sini')).toBeInTheDocument();
    await user.click(send);

    await screen.findByTestId('status-page');
    expect(db.calls.find((c) => c.path === '/api/public/orders')?.body).toMatchObject({
      type: 'dine_in',
      items: [{ itemId: 9, qty: 1, optionIds: [] }],
    });
    const bill = await screen.findByTestId('table-bill');
    expect(bill).toHaveTextContent('Tagihan Meja 5');
    expect(bill).toHaveTextContent('Ronde 1 · #21');

    // pesan lagi → ronde kedua
    await user.click(screen.getByRole('button', { name: 'Pesan lagi' }));
    await screen.findByTestId('table-banner');
    await screen.findByText(/Tagihan meja: 4.000 ៛/);
    await user.click(within(screen.getByTestId('item-8')).getByRole('button', { name: 'Tambah Nasi Putih' }));
    await user.click(screen.getByTestId('cart-bar'));
    await user.click(
      within(await screen.findByTestId('cart-page')).getByRole('button', { name: /Kirim ke dapur/ }),
    );
    expect(await screen.findByText('Ronde 2 · #22')).toBeInTheDocument();

    await user.click(within(screen.getByTestId('table-bill')).getByRole('button', { name: 'Minta bill' }));
    expect(
      await screen.findByRole('button', { name: 'Bill sudah diminta, kasir segera datang' }),
    ).toBeDisabled();
    expect(db.billRequested).toBe(true);
  });

  it('QR tidak berlaku / sudah diganti → pesan ramah', async () => {
    renderApp('/m/tok_OLD_regenerated_token_123456');
    expect(await screen.findByRole('heading', { name: 'QR meja tidak berlaku' })).toBeInTheDocument();
    expect(screen.getByText(/Minta QR terbaru ke kasir/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Lanjut di website' })).toBeInTheDocument();
  });

  it('token terlalu pendek ditolak tanpa memanggil server', async () => {
    renderApp('/m/abc');
    expect(await screen.findByRole('heading', { name: 'QR meja tidak berlaku' })).toBeInTheDocument();
    expect(db.calls.some((c) => c.path === '/api/public/session/table')).toBe(false);
  });
});

describe('mode Telegram (/tg)', () => {
  function stubTelegram(user = { id: 777, first_name: 'Budi', username: 'budi_pp', language_code: 'id' }) {
    const initData = `query_id=AA&user=${encodeURIComponent(JSON.stringify(user))}&auth_date=1&hash=abc`;
    window.Telegram = {
      WebApp: {
        initData,
        initDataUnsafe: { user },
        ready: () => undefined,
        expand: () => undefined,
        close: () => undefined,
      },
    };
    return initData;
  }

  it('login otomatis via initData, banner Halo, tipe dikunci Delivery', async () => {
    const initData = stubTelegram();
    const user = userEvent.setup();
    renderApp('/tg');
    const banner = await screen.findByTestId('tg-banner');
    expect(banner).toHaveTextContent('Halo Budi · Masuk otomatis via Telegram');
    expect(banner).toHaveTextContent('Delivery');
    expect(screen.queryByRole('radiogroup', { name: 'Tipe pesanan' })).toBeNull();
    expect(db.calls).toContainEqual(
      expect.objectContaining({ path: '/api/public/session/telegram', body: { initData } }),
    );

    await screen.findByRole('heading', { name: 'Paling laris' });
    await user.click(within(screen.getByTestId('item-9')).getByRole('button', { name: 'Tambah Kerupuk' }));
    await user.click(screen.getByTestId('cart-bar'));
    expect(await screen.findByRole('button', { name: /Lanjut ke alamat/ })).toBeEnabled();
    expect(screen.queryByRole('radiogroup', { name: 'Tipe pesanan' })).toBeNull();
    await user.click(screen.getByRole('button', { name: /Lanjut ke alamat/ }));
    expect(await screen.findByText(/Kontak: chat Telegram @budi_pp/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+ Bagikan no. HP (opsional)' })).toBeInTheDocument();
  });

  it('bahasa awal dari language_code Telegram', async () => {
    stubTelegram({ id: 1, first_name: 'Sok', username: 'sok', language_code: 'km' });
    renderApp('/tg');
    expect(await screen.findByTestId('tg-banner')).toHaveTextContent('សួស្តី Sok');
    expect(await screen.findByRole('heading', { name: 'លក់ដាច់ជាងគេ' })).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('km');
  });

  it('di browser biasa (tanpa Telegram) → pesan login gagal + lanjut di website', async () => {
    renderApp('/tg');
    expect(await screen.findByRole('heading', { name: 'Login Telegram gagal' })).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Lanjut di website' }));
    expect(await screen.findByRole('radiogroup', { name: 'Tipe pesanan' })).toBeInTheDocument();
  });
});
