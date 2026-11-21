import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { cartStore } from '../lib/cart';
import { renderApp } from '../test/render';

async function openAyamGoreng() {
  const user = userEvent.setup();
  renderApp('/');
  await screen.findByRole('heading', { name: 'Paling laris' });
  await user.click(within(screen.getByTestId('item-1')).getByRole('button', { name: 'Tambah Ayam Goreng' }));
  const sheet = await screen.findByRole('dialog', { name: 'Ayam Goreng' });
  return { user, sheet };
}

describe('Lembar opsi (ItemOpsi)', () => {
  it('validasi grup wajib, batas maks, pilihan habis, total langsung', async () => {
    const { user, sheet } = await openAyamGoreng();
    const s = within(sheet);
    const submit = s.getByRole('button', { name: /^Tambah · / });
    expect(submit).toBeDisabled();
    expect(submit).toHaveTextContent('Tambah · 10.000 ៛');
    expect(s.getByText('Pilih Bagian ayam dulu')).toBeInTheDocument();
    expect(s.getByText('mulai 10.000 ៛')).toBeInTheDocument();

    const part = s.getByRole('radiogroup', { name: 'Bagian ayam' });
    expect(within(part).getByRole('radio', { name: /Sayap/ })).toBeDisabled();
    await user.click(within(part).getByRole('radio', { name: /Dada/ }));
    expect(within(part).getByRole('radio', { name: /Dada/ })).toHaveAttribute('aria-checked', 'true');
    expect(s.getByText('Pilih Level pedas dulu')).toBeInTheDocument();

    const spicy = s.getByRole('radiogroup', { name: 'Level pedas' });
    await user.click(within(spicy).getByRole('radio', { name: /Extra pedas/ }));
    expect(within(spicy).getByRole('radio', { name: /Extra pedas/ })).toHaveAttribute('aria-checked', 'true');
    expect(submit).toBeEnabled();
    expect(submit).toHaveTextContent('Tambah · 11.000 ៛');
    expect(s.queryByText(/dulu$/)).toBeNull();

    const extras = s.getByRole('group', { name: 'Tambahan' });
    expect(s.getByText('Opsional · maksimal 3 (0/3)')).toBeInTheDocument();
    expect(within(extras).getByRole('checkbox', { name: /Tempe/ })).toBeDisabled();
    await user.click(within(extras).getByRole('checkbox', { name: /Nasi/ }));
    await user.click(within(extras).getByRole('checkbox', { name: /Telur ceplok/ }));
    await user.click(within(extras).getByRole('checkbox', { name: /Sambal ekstra/ }));
    expect(s.getByText('Opsional · maksimal 3 (3/3)')).toBeInTheDocument();
    expect(within(extras).getByRole('checkbox', { name: /Tahu/ })).toBeDisabled();
    // 10.000 + 1.000 + 2.000 + 3.000 + 1.000
    expect(submit).toHaveTextContent('Tambah · 17.000 ៛');

    await user.click(s.getByRole('button', { name: 'Tambah satu Ayam Goreng' }));
    expect(submit).toHaveTextContent('Tambah · 34.000 ៛');
    await user.type(s.getByLabelText(/Catatan untuk dapur/), 'sambal dipisah');
    await user.click(submit);

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(cartStore.get()).toEqual([
      expect.objectContaining({ itemId: 1, qty: 2, optionIds: [2, 7, 8, 9, 10], note: 'sambal dipisah' }),
    ]);
    expect(screen.getByTestId('cart-bar')).toHaveTextContent('2 item · 34.000 ៛');
  });

  it('bisa ditutup dengan tombol kembali tanpa menambah', async () => {
    const { user, sheet } = await openAyamGoreng();
    await user.click(within(sheet).getByRole('button', { name: 'Kembali ke menu' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(cartStore.get()).toHaveLength(0);
  });
});
