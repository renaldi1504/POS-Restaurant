import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { cartStore } from '../lib/cart';
import { checkoutStore } from '../lib/checkout';
import { makeSettings } from '../test/fixtures';
import { renderApp } from '../test/render';
import { db } from '../test/server';

describe('Keranjang & checkout', () => {
  it('minimal order delivery memblokir lanjut; ambil sendiri tidak', async () => {
    db.settings = makeSettings({ delivery: { minOrder: 20000, defaultFee: 0 } });
    cartStore.add({ itemId: 9, qty: 1 });
    cartStore.add({ itemId: 8, qty: 1 });
    const user = userEvent.setup();
    renderApp('/keranjang');
    const page = await screen.findByTestId('cart-page');
    expect(await within(page).findByTestId('min-order')).toHaveTextContent(
      'Minimal order delivery 20.000 ៛ · kurang 16.000 ៛',
    );
    expect(within(page).getByRole('button', { name: /Lanjut ke alamat/ })).toBeDisabled();

    await user.click(within(page).getByRole('radio', { name: 'Ambil sendiri' }));
    expect(within(page).queryByTestId('min-order')).toBeNull();
    expect(within(page).getByRole('button', { name: /Lanjut ke pembayaran/ })).toBeEnabled();

    // Makan di sini tanpa QR meja → diarahkan scan QR, tidak bisa lanjut.
    await user.click(within(page).getByRole('radio', { name: 'Makan di sini' }));
    expect(within(page).getByTestId('dine-info')).toHaveTextContent('scan QR');
    expect(within(page).getByRole('button', { name: /Lanjut ke pembayaran/ })).toBeDisabled();
  });

  it('ubah jumlah & hapus item di keranjang', async () => {
    cartStore.add({ itemId: 9, qty: 1 });
    cartStore.add({ itemId: 1, qty: 1, optionIds: [1, 4] });
    const user = userEvent.setup();
    renderApp('/keranjang');
    const page = await screen.findByTestId('cart-page');
    expect(await within(page).findByText('Paha, Tidak pedas')).toBeInTheDocument();
    await user.click(within(page).getByRole('button', { name: 'Tambah satu Kerupuk' }));
    expect(within(page).getByText('4.000 ៛', { selector: 'b' })).toBeInTheDocument();
    await user.click(within(page).getByRole('button', { name: 'Hapus Ayam Goreng' }));
    expect(within(page).queryByText('Ayam Goreng')).toBeNull();
    expect(cartStore.get()).toEqual([expect.objectContaining({ itemId: 9, qty: 2 })]);

    await user.click(within(page).getByRole('button', { name: 'Hapus Kerupuk' }));
    expect(await screen.findByText('Keranjang masih kosong')).toBeInTheDocument();
  });

  it('website: delivery → alamat (manual) → bayar ABA dengan upload bukti → status', async () => {
    cartStore.add({ itemId: 9, qty: 2 });
    const user = userEvent.setup();
    renderApp('/keranjang');
    await user.click(await screen.findByRole('button', { name: /Lanjut ke alamat/ }));

    const addr = await screen.findByTestId('address-page');
    expect(within(addr).getByTestId('placeholder-map')).toBeInTheDocument();
    await user.click(within(addr).getByRole('button', { name: /Lanjut ke pembayaran/ }));
    expect(within(addr).getByRole('alert')).toHaveTextContent('Isi alamat lengkap dulu');

    await user.type(within(addr).getByLabelText('Alamat lengkap'), 'Jl. Ekareach no. 5');
    await user.type(within(addr).getByLabelText('Lintang (lat)'), '10.61');
    await user.type(within(addr).getByLabelText('Bujur (lng)'), '103.52');
    await user.type(within(addr).getByLabelText(/Patokan/), 'pagar biru');
    await user.type(within(addr).getByLabelText('Nama Anda'), 'Ani');
    await user.type(within(addr).getByLabelText('No. HP'), '012345678');
    await user.click(within(addr).getByRole('button', { name: /Lanjut ke pembayaran/ }));

    const co = await screen.findByTestId('checkout-page');
    expect(within(co).getByText(/Jl. Ekareach no. 5 · pagar biru/)).toBeInTheDocument();
    await user.click(within(co).getByRole('radio', { name: /Bayar ABA/ }));
    const panel = within(co).getByTestId('aba-panel');
    expect(panel).toHaveTextContent('4.000 ៛');
    // Rekening ABA dari settings publik (settings.payment.aba).
    expect(within(panel).getByTestId('aba-account')).toHaveTextContent('RM BERKAT');
    expect(within(panel).getByTestId('aba-account')).toHaveTextContent('000 111 222');
    const file = new File(['x'.repeat(2000)], 'bukti.png', { type: 'image/png' });
    await user.upload(within(panel).getByLabelText('Upload bukti transfer'), file);
    expect(await within(panel).findByRole('img', { name: 'Pratinjau bukti transfer' })).toBeInTheDocument();

    await user.click(within(co).getByRole('button', { name: 'Pesan sekarang · 4.000 ៛' }));
    expect(await screen.findByTestId('status-page')).toBeInTheDocument();
    expect(await screen.findByTestId('proof-done')).toHaveTextContent('Bukti terkirim');

    const orderCall = db.calls.find((c) => c.path === '/api/public/orders');
    expect(orderCall?.body).toMatchObject({
      type: 'delivery',
      paymentMethod: 'aba',
      items: [{ itemId: 9, qty: 2, optionIds: [] }],
      contact: {
        name: 'Ani',
        phone: '012345678',
        addressText: 'Jl. Ekareach no. 5',
        landmark: 'pagar biru',
        lat: 10.61,
        lng: 103.52,
      },
    });
    expect(db.calls.some((c) => c.path.endsWith('/proof') && c.body === 'multipart')).toBe(true);
    expect(cartStore.get()).toHaveLength(0);
  });

  it('ABA tanpa rekening di settings → petunjuk tanya kasir', async () => {
    db.settings = makeSettings({ aba: null });
    cartStore.add({ itemId: 9, qty: 1 });
    checkoutStore.update({ name: 'Ani' });
    const user = userEvent.setup();
    renderApp('/keranjang');
    await user.click(await screen.findByRole('radio', { name: 'Ambil sendiri' }));
    await user.click(screen.getByRole('button', { name: /Lanjut ke pembayaran/ }));
    const co = await screen.findByTestId('checkout-page');
    await user.click(within(co).getByRole('radio', { name: /Bayar ABA/ }));
    const panel = within(co).getByTestId('aba-panel');
    expect(within(panel).queryByTestId('aba-account')).toBeNull();
    expect(panel).toHaveTextContent('Tanya kasir: 012 888 999');
  });

  it('website: ambil sendiri wajib nama, cash di kasir', async () => {
    cartStore.add({ itemId: 5, qty: 1, optionIds: [] });
    checkoutStore.update({ type: 'takeaway' });
    const user = userEvent.setup();
    renderApp('/checkout');
    const co = await screen.findByTestId('checkout-page');
    expect(within(co).getByRole('radio', { name: /Cash di kasir/ })).toHaveAttribute('aria-checked', 'true');
    await user.click(within(co).getByRole('button', { name: /Pesan sekarang/ }));
    expect(within(co).getByRole('alert')).toHaveTextContent('Isi nama dulu');
    await user.type(within(co).getByLabelText('Nama Anda'), 'Pak Hasan');
    await user.click(within(co).getByRole('button', { name: /Pesan sekarang/ }));
    await screen.findByTestId('status-page');
    expect(db.calls.find((c) => c.path === '/api/public/orders')?.body).toMatchObject({
      type: 'takeaway',
      paymentMethod: 'cash',
      contact: { name: 'Pak Hasan', addressText: 'Ambil sendiri' },
    });
  });
});
