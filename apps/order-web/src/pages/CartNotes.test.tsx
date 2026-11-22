import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { cartStore } from '../lib/cart';
import { applyLangParam, currentLang } from '../lib/i18n';
import { renderApp } from '../test/render';

describe('Keranjang: catatan per menu & tipe order ikon', () => {
  it('setiap menu bisa diberi catatan sendiri', async () => {
    const user = userEvent.setup();
    cartStore.add({ itemId: 9, qty: 1 });
    cartStore.add({ itemId: 8, qty: 2 });
    renderApp('/keranjang');
    await user.click(await screen.findByRole('button', { name: 'Catatan untuk Kerupuk' }));
    await user.type(screen.getByRole('textbox', { name: 'Catatan untuk Kerupuk' }), 'yang renyah');
    await user.click(screen.getByRole('button', { name: 'Simpan' }));
    expect(screen.getByText('yang renyah')).toBeInTheDocument();
    const lines = cartStore.get();
    expect(lines.find((l) => l.itemId === 9)?.note).toBe('yang renyah');
    expect(lines.find((l) => l.itemId === 8)?.note).toBeUndefined();
    expect(cartStore.toOrderItems()).toContainEqual({
      itemId: 9,
      qty: 1,
      optionIds: [],
      note: 'yang renyah',
    });
  });

  it('tipe order: 3 ikon dengan label kecil, bisa dipilih', async () => {
    const user = userEvent.setup();
    cartStore.add({ itemId: 9, qty: 1 });
    renderApp('/keranjang');
    const group = await screen.findByRole('radiogroup', { name: 'Tipe pesanan' });
    const radios = within(group).getAllByRole('radio');
    expect(radios.map((r) => r.getAttribute('aria-label'))).toEqual([
      'Delivery',
      'Ambil sendiri',
      'Makan di sini',
    ]);
    await user.click(within(group).getByRole('radio', { name: 'Ambil sendiri' }));
    expect(within(group).getByRole('radio', { name: 'Ambil sendiri' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  it('bahasa dari bot (?lang=kh) diterapkan; nilai tidak dikenal diabaikan', () => {
    expect(applyLangParam('?lang=kh')).toBe(true);
    expect(currentLang()).toBe('kh');
    expect(applyLangParam('?lang=th')).toBe(false);
    expect(applyLangParam('')).toBe(false);
    applyLangParam('?lang=id');
  });
});
