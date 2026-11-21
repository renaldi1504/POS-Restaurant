import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cartStore } from '../lib/cart';
import { renderApp } from '../test/render';
import { db } from '../test/server';

function stubTelegram() {
  const user = { id: 777, first_name: 'Budi', username: 'budi_pp', language_code: 'id' };
  window.Telegram = {
    WebApp: {
      initData: `user=${encodeURIComponent(JSON.stringify(user))}&auth_date=1&hash=abc`,
      initDataUnsafe: { user },
      ready: () => undefined,
      expand: () => undefined,
      close: () => undefined,
    },
  };
}

function mockGeo(result: 'ok' | 'denied') {
  const geo = {
    getCurrentPosition: (ok: PositionCallback, fail: PositionErrorCallback) =>
      result === 'ok'
        ? ok({ coords: { latitude: 10.6111, longitude: 103.5222 } } as GeolocationPosition)
        : fail({ code: 1, message: 'denied' } as GeolocationPositionError),
  };
  Object.defineProperty(navigator, 'geolocation', { value: geo, configurable: true });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Halaman alamat', () => {
  it('izin lokasi ditolak → pesan jelas', async () => {
    mockGeo('denied');
    cartStore.add({ itemId: 9, qty: 1 });
    const user = userEvent.setup();
    renderApp('/alamat');
    const page = await screen.findByTestId('address-page');
    await user.click(within(page).getByRole('button', { name: 'Pakai lokasi saya sekarang' }));
    expect(await within(page).findByRole('alert')).toHaveTextContent('Izin lokasi ditolak');
  });

  it('Telegram: pakai lokasi saya → simpan alamat → order delivery dengan addressId', async () => {
    stubTelegram();
    mockGeo('ok');
    const user = userEvent.setup();
    renderApp('/tg');
    await screen.findByTestId('tg-banner');
    await screen.findByRole('heading', { name: 'Paling laris' });
    await user.click(within(screen.getByTestId('item-9')).getByRole('button', { name: 'Tambah Kerupuk' }));
    await user.click(screen.getByTestId('cart-bar'));
    await user.click(await screen.findByRole('button', { name: /Lanjut ke alamat/ }));

    const page = await screen.findByTestId('address-page');
    await user.click(within(page).getByRole('button', { name: 'Pakai lokasi saya sekarang' }));
    expect(await within(page).findByText('Lokasi ditemukan')).toBeInTheDocument();
    expect(within(page).getByLabelText('Lintang (lat)')).toHaveValue('10.611100');
    // Alamat lengkap terisi otomatis dari titik GPS; tetap bisa diubah.
    const text = within(page).getByLabelText('Alamat lengkap');
    await waitFor(() => expect(text).toHaveValue('Jl. Ekareach, Sihanoukville'));
    expect(within(page).getByText(/terisi otomatis dari lokasi/)).toBeInTheDocument();
    expect(within(page).getByLabelText(/Patokan/)).toBeInTheDocument();
    await user.clear(text);
    await user.type(text, 'Hotel Sokha, kamar 210');
    await user.click(within(page).getByRole('radio', { name: 'Hotel' }));
    await user.click(within(page).getByRole('button', { name: /Lanjut ke pembayaran/ }));

    const co = await screen.findByTestId('checkout-page');
    expect(db.calls.find((c) => c.path === '/api/public/addresses')?.body).toMatchObject({
      label: 'Hotel',
      text: 'Hotel Sokha, kamar 210',
      lat: 10.6111,
      lng: 103.5222,
    });
    expect(within(co).getByRole('radio', { name: /Cash saat diantar/ })).toBeInTheDocument();
    await user.click(within(co).getByRole('button', { name: /Pesan sekarang/ }));
    await screen.findByTestId('status-page');
    expect(db.calls.find((c) => c.path === '/api/public/orders')?.body).toMatchObject({
      type: 'delivery',
      addressId: 1,
      paymentMethod: 'cash',
    });
  });
});
