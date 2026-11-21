import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { fx } from '../../test/fixtures';
import { OptionSheet } from './OptionSheet';

const item = fx.menu.items[0]!;
const groups = fx.menu.optionGroups;

function setup() {
  const onAdd = vi.fn();
  render(
    <OptionSheet
      item={item}
      groups={groups}
      basePrice={10000}
      currency="KHR"
      onClose={() => {}}
      onAdd={onAdd}
    />,
  );
  const addBtn = () => screen.getByRole('button', { name: /^Tambah · / });
  return { onAdd, addBtn };
}

describe('Lembar opsi (aturan sama dengan website)', () => {
  it('tombol Tambah nonaktif sampai semua grup wajib terpenuhi', async () => {
    const { addBtn, onAdd } = setup();
    expect(addBtn()).toBeDisabled();
    expect(screen.getByText('Pilih Bagian ayam dulu')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('radio', { name: /Dada/ }));
    expect(addBtn()).toBeDisabled();
    expect(screen.getByText('Pilih Level pedas dulu')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('radio', { name: /Tidak pedas/ }));
    expect(addBtn()).toBeEnabled();
    expect(addBtn()).toHaveTextContent('Tambah · 10.000 ៛');
    await userEvent.click(addBtn());
    expect(onAdd).toHaveBeenCalledWith({ optionIds: [11, 21], qty: 1, note: undefined });
  });

  it('pilih-1 bersifat radio (ganti pilihan), pilihan habis tidak bisa dipilih', async () => {
    setup();
    await userEvent.click(screen.getByRole('radio', { name: /Dada/ }));
    await userEvent.click(screen.getByRole('radio', { name: /Paha atas/ }));
    expect(screen.getByRole('radio', { name: /Dada/ })).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByRole('radio', { name: /Paha atas/ })).toHaveAttribute('aria-checked', 'true');
    const sayap = screen.getByRole('radio', { name: /Sayap/ });
    expect(sayap).toHaveAttribute('aria-disabled', 'true');
    await userEvent.click(sayap);
    expect(sayap).toHaveAttribute('aria-checked', 'false');
  });

  it('batas maksimal grup multi & total ikut berubah (harga opsi × jumlah)', async () => {
    const { addBtn, onAdd } = setup();
    await userEvent.click(screen.getByRole('radio', { name: /Dada/ }));
    await userEvent.click(screen.getByRole('radio', { name: /Extra pedas/ })); // +1.000
    await userEvent.click(screen.getByRole('checkbox', { name: /Nasi/ })); // +2.000
    await userEvent.click(screen.getByRole('checkbox', { name: /Telur ceplok/ })); // +3.000
    await userEvent.click(screen.getByRole('checkbox', { name: /Sambal ekstra/ })); // +1.000 (3/3)
    expect(screen.getByText(/Opsional · maksimal 3 \(3\/3\)/)).toBeInTheDocument();
    const tahu = screen.getByRole('checkbox', { name: /Tahu/ });
    expect(tahu).toHaveAttribute('aria-disabled', 'true');
    await userEvent.click(tahu);
    expect(tahu).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByRole('checkbox', { name: /Tempe/ })).toHaveAttribute('aria-disabled', 'true'); // habis
    expect(addBtn()).toHaveTextContent('Tambah · 17.000 ៛');
    await userEvent.click(screen.getByRole('button', { name: 'Tambah jumlah' }));
    expect(addBtn()).toHaveTextContent('Tambah · 34.000 ៛');
    await userEvent.type(screen.getByLabelText(/Catatan untuk dapur/), 'sambal dipisah');
    await userEvent.click(addBtn());
    expect(onAdd).toHaveBeenCalledWith({ optionIds: [11, 22, 31, 32, 33], qty: 2, note: 'sambal dipisah' });
  });
});
