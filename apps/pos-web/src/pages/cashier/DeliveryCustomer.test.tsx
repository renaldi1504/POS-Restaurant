import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { CustomerSearchItem, StaffAddressDto } from '@pos/shared';
import { getCart, setCart } from '../../lib/cart';
import { renderApp } from '../../test/render';
import { http, HttpResponse, server } from '../../test/server';
import { DeliveryCustomerSection } from './DeliveryCustomer';

const home: StaffAddressDto = {
  id: 3,
  label: 'Alamat',
  text: 'Street 108, Sihanoukville',
  landmark: 'Dekat masjid',
  lat: 10.61,
  lng: 103.52,
  lastUsedAt: '2026-11-20T10:00:00.000Z',
};
const office: StaffAddressDto = {
  id: 4,
  label: 'Alamat',
  text: 'Hotel Ocean kamar 12',
  landmark: null,
  lat: null,
  lng: null,
  lastUsedAt: null,
};
const sokha: CustomerSearchItem = {
  id: 7,
  name: 'Sokha',
  username: 'sokha_kh',
  phone: '012 888 999',
  telegramId: '5551234',
  lastAddress: home,
  addressCount: 2,
  orderCount: 5,
  lastOrderAt: '2026-11-20T10:00:00.000Z',
};

function mockCustomerApi() {
  const created: unknown[] = [];
  let list = [home, office];
  server.use(
    http.get('*/api/customers/search', ({ request }) => {
      const q = new URL(request.url).searchParams.get('q') ?? '';
      return HttpResponse.json({ customers: 'sokha'.includes(q.toLowerCase()) ? [sokha] : [] });
    }),
    http.get('*/api/customers/7/addresses', () =>
      HttpResponse.json({
        customer: { id: 7, name: 'Sokha', username: 'sokha_kh', phone: '012 888 999', telegramId: '5551234' },
        addresses: list,
      }),
    ),
    http.post('*/api/customers/7/addresses', async ({ request }) => {
      const body = (await request.json()) as Omit<StaffAddressDto, 'id' | 'label' | 'lastUsedAt'>;
      created.push(body);
      const a: StaffAddressDto = {
        id: 9,
        label: 'Alamat',
        text: body.text,
        landmark: body.landmark ?? null,
        lat: body.lat ?? null,
        lng: body.lng ?? null,
        lastUsedAt: null,
      };
      list = [a, ...list];
      return HttpResponse.json({ address: a });
    }),
    http.get('*/api/public/geocode', () =>
      HttpResponse.json({ text: 'Ekareach Street, Sihanoukville', provider: 'google' }),
    ),
  );
  return { created };
}

describe('Data pengantaran: cari pelanggan & alamat', () => {
  it('cari → pilih pelanggan Telegram → alamat utama terpilih → ganti alamat → alamat baru dari link', async () => {
    const { created } = mockCustomerApi();
    setCart({ kind: 'telegram' });
    renderApp(<DeliveryCustomerSection showErrors={false} />);
    expect(screen.getByText(/supaya dia menerima notifikasi/)).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('Cari pelanggan lama'), 'sok');
    const result = await screen.findByTestId('customer-result');
    expect(result).toHaveTextContent('Sokha');
    expect(result).toHaveTextContent('@sokha_kh · 012 888 999');
    expect(result).toHaveTextContent('Street 108, Sihanoukville');
    expect(result).toHaveTextContent('5 order');
    await userEvent.click(result);

    expect(screen.getByTestId('picked-customer')).toHaveTextContent(
      'Pelanggan Telegram@sokha_kh · 012 888 999',
    );
    expect(screen.queryByText(/supaya dia menerima notifikasi/)).not.toBeInTheDocument();
    expect(screen.getByLabelText('Nama')).toHaveValue('Sokha');
    const card = screen.getByTestId('address-card');
    expect(card).toHaveTextContent('Street 108, Sihanoukville');
    expect(card).toHaveTextContent('Dekat masjid');
    expect(within(card).getByTestId('point-set')).toHaveTextContent('Titik peta ada');
    expect(getCart()).toMatchObject({ customer: { id: 7 }, addressId: 3, delivery: { lat: 10.61 } });

    // Ganti alamat → pilih alamat lain
    const change = within(card).getByRole('button', { name: /Ganti alamat/ });
    await expect.poll(() => change.hasAttribute('disabled')).toBe(false);
    await userEvent.click(change);
    const sheet = screen.getByRole('dialog');
    await userEvent.click(within(sheet).getByRole('radio', { name: /Hotel Ocean/ }));
    expect(screen.getByTestId('address-card')).toHaveTextContent('Hotel Ocean kamar 12');
    expect(screen.getByTestId('address-card')).toHaveTextContent('Belum ada titik peta');
    expect(getCart()).toMatchObject({ addressId: 4, delivery: { lat: null } });

    // Alamat baru: tempel link → titik + alamat otomatis → simpan ke pelanggan
    await userEvent.click(screen.getByRole('button', { name: /Alamat baru/ }));
    expect(screen.getByTestId('new-address')).toBeInTheDocument();
    expect(getCart().addressId).toBeNull();
    await userEvent.type(screen.getByLabelText('Link lokasi'), 'https://maps.google.com/?q=10.6311,103.5011');
    expect(await screen.findByText(/Alamat diisi otomatis/)).toBeInTheDocument();
    expect(screen.getByTestId('link-status')).toHaveTextContent('10.63110, 103.50110');
    expect(screen.getByLabelText('Alamat')).toHaveValue('Ekareach Street, Sihanoukville');
    await userEvent.type(screen.getByLabelText('Patokan'), 'Pagar biru');
    await userEvent.click(screen.getByRole('button', { name: /Simpan alamat ke pelanggan/ }));
    expect(await screen.findByTestId('address-card')).toHaveTextContent('Ekareach Street, Sihanoukville');
    expect(created).toEqual([
      { text: 'Ekareach Street, Sihanoukville', landmark: 'Pagar biru', lat: 10.6311, lng: 103.5011 },
    ]);
    expect(getCart()).toMatchObject({ addressId: 9, delivery: { lat: 10.6311, landmark: 'Pagar biru' } });
  });

  it('tidak ditemukan → isi pelanggan baru; link bukan lokasi → pesan jelas; ganti pelanggan mengosongkan', async () => {
    mockCustomerApi();
    setCart({ kind: 'delivery' });
    renderApp(<DeliveryCustomerSection showErrors />);
    expect(screen.queryByText(/supaya dia menerima notifikasi/)).not.toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Cari pelanggan lama'), 'zzz');
    expect(await screen.findByText(/Tidak ditemukan/)).toBeInTheDocument();
    expect(screen.getAllByText('Wajib').length).toBeGreaterThanOrEqual(2);
    await userEvent.type(screen.getByLabelText('Link lokasi'), 'https://example.com/abc');
    expect(await screen.findByRole('alert')).toHaveTextContent('Link tidak dikenali');
    expect(screen.queryByRole('button', { name: /Simpan alamat ke pelanggan/ })).not.toBeInTheDocument();
  });
});
