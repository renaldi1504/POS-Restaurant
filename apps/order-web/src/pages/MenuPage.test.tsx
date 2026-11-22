import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { cartStore } from '../lib/cart';
import { makeSettings } from '../test/fixtures';
import { renderApp } from '../test/render';
import { db } from '../test/server';
import { emitSocket } from '../test/socketMock';

async function openMenu(path = '/') {
  const r = renderApp(path);
  await screen.findByRole('heading', { name: 'Paling laris' });
  return r;
}

const results = () => screen.getByTestId('results');

describe('MenuPage (mode biasa)', () => {
  it('menampilkan header, status buka, tipe pesanan, kategori dengan jumlah', async () => {
    await openMenu();
    expect(screen.getByTestId('order-menu')).toHaveAttribute('data-mode', 'none');
    expect(screen.getByRole('heading', { name: 'Rumah Makan Berkat' })).toBeInTheDocument();
    expect(screen.getByTestId('open-status')).toHaveTextContent('Buka · sampai 03.00');
    const types = screen.getByRole('radiogroup', { name: 'Tipe pesanan' });
    expect(
      within(types)
        .getAllByRole('radio')
        .map((r) => r.textContent),
    ).toEqual(['Delivery', 'Ambil sendiri', 'Makan di sini']);
    const nav = screen.getByRole('navigation', { name: 'Kategori' });
    expect(
      within(nav)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['Terlaris3', 'Ayam2', 'Pempek2', 'Minuman3', 'Tambahan2']);
    expect(within(nav).getByRole('button', { name: /Terlaris/ })).toHaveAttribute('aria-pressed', 'true');
  });

  it('pencarian live cocok di semua bahasa + nama kategori', async () => {
    const user = userEvent.setup();
    await openMenu();
    const search = screen.getByRole('searchbox', { name: 'Cari menu' });

    await user.type(search, 'fried');
    expect(screen.getByText('1 hasil untuk “fried”')).toBeInTheDocument();
    expect(within(results()).getByRole('article', { name: 'Ayam Goreng' })).toBeInTheDocument();

    await user.clear(search);
    await user.type(search, '炸鸡');
    expect(within(results()).getByRole('article', { name: 'Ayam Goreng' })).toBeInTheDocument();

    await user.clear(search);
    await user.type(search, 'ភេសជ្ជៈ'); // kategori Minuman (kh)
    expect(
      within(results())
        .getAllByRole('article')
        .map((a) => a.getAttribute('aria-label')),
    ).toEqual(['Kopi Susu', 'Kopi Hitam', 'Es Teh Manis']);

    await user.clear(search);
    await user.type(search, 'drinks');
    expect(within(results()).getAllByRole('article')).toHaveLength(3);

    await user.clear(search);
    await user.type(search, 'pizza');
    expect(screen.getByText('Menu tidak ditemukan')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Hapus pencarian' }));
    expect(screen.getByRole('heading', { name: 'Paling laris' })).toBeInTheDocument();
  });

  it('kategori: lompat ke bagian & tersorot; menu habis di bawah & tidak bisa ditambah', async () => {
    const user = userEvent.setup();
    const scrolled: string[] = [];
    Element.prototype.scrollIntoView = function (this: Element) {
      scrolled.push(this.id);
    };
    await openMenu();
    const nav = screen.getByRole('navigation', { name: 'Kategori' });
    await user.click(within(nav).getByRole('button', { name: /^Pempek/ }));
    expect(scrolled).toContain('sec-2');
    expect(within(nav).getByRole('button', { name: /^Pempek/ })).toHaveAttribute('aria-pressed', 'true');
    expect(within(nav).getByRole('button', { name: /Terlaris/ })).toHaveAttribute('aria-pressed', 'false');
    const section = screen.getByRole('region', { name: 'Pempek' });
    expect(within(section).getByText('2 menu')).toBeInTheDocument();
    const names = within(section)
      .getAllByRole('article')
      .map((a) => a.getAttribute('aria-label'));
    expect(names).toEqual(['Pempek Kapal Selam', 'Pempek Lenjer']);
    const lenjer = within(section).getByRole('article', { name: 'Pempek Lenjer' });
    expect(within(lenjer).getByText('Habis')).toBeInTheDocument();
    expect(within(lenjer).queryByRole('button')).toBeNull();
  });

  it('saat mencari, bar kategori disembunyikan', async () => {
    const user = userEvent.setup();
    await openMenu();
    await user.type(screen.getByRole('searchbox', { name: 'Cari menu' }), 'kopi');
    expect(screen.queryByRole('navigation', { name: 'Kategori' })).toBeNull();
  });

  it('+ Tambah berubah jadi stepper − n +, bar keranjang muncul', async () => {
    const user = userEvent.setup();
    await openMenu();
    const card = screen.getByTestId('item-9');
    await user.click(within(card).getByRole('button', { name: 'Tambah Kerupuk' }));
    expect(within(card).getByRole('group', { name: 'Jumlah Kerupuk' })).toHaveTextContent('1');
    await user.click(within(card).getByRole('button', { name: 'Tambah satu Kerupuk' }));
    expect(within(card).getByRole('group', { name: 'Jumlah Kerupuk' })).toHaveTextContent('2');
    expect(screen.getByTestId('cart-bar')).toHaveTextContent('2 item · 4.000 ៛');
    expect(screen.getByTestId('cart-bar')).toHaveTextContent('Lihat pesanan');
    await user.click(within(card).getByRole('button', { name: 'Kurangi Kerupuk' }));
    await user.click(within(card).getByRole('button', { name: 'Kurangi Kerupuk' }));
    expect(within(card).getByRole('button', { name: 'Tambah Kerupuk' })).toBeInTheDocument();
    expect(screen.queryByTestId('cart-bar')).toBeNull();
  });

  it('realtime menu.availability menandai menu habis', async () => {
    await openMenu();
    expect(
      within(screen.getByTestId('item-9')).getByRole('button', { name: 'Tambah Kerupuk' }),
    ).toBeInTheDocument();
    act(() =>
      emitSocket('menu.availability', {
        kind: 'item',
        id: 9,
        available: false,
        at: new Date().toISOString(),
      }),
    );
    expect(await within(screen.getByTestId('item-9')).findByText('Habis')).toBeInTheDocument();
  });

  it('keranjang tersimpan di sessionStorage dan dipulihkan', async () => {
    const user = userEvent.setup();
    const first = await openMenu();
    await user.click(within(screen.getByTestId('item-8')).getByRole('button', { name: 'Tambah Nasi Putih' }));
    expect(JSON.parse(sessionStorage.getItem('order.cart.online') ?? '[]')).toEqual([
      expect.objectContaining({ itemId: 8, qty: 1 }),
    ]);
    first.unmount();
    cartStore.reload();
    await openMenu();
    expect(screen.getByTestId('cart-bar')).toHaveTextContent('1 item · 2.000 ៛');
  });

  it('istirahat antar sesi: buka lagi jam sesi berikutnya + daftar sesi', async () => {
    db.settings = makeSettings({
      isOpen: false,
      hours: {
        open: '08:00',
        close: '20:00',
        periods: [
          { open: '08:00', close: '14:00' },
          { open: '17:00', close: '20:00' },
        ],
        nextOpen: '17:00',
      },
    });
    await openMenu();
    expect(screen.getByTestId('open-status')).toHaveTextContent('Sedang tutup · buka jam 17.00');
    expect(screen.getByText(/pesanan dibuka lagi jam 17\.00/)).toBeInTheDocument();
    expect(screen.getByTestId('open-sessions')).toHaveTextContent('Jam buka: 08.00–14.00 · 17.00–20.00');
  });

  it('jam tutup: status "Sedang tutup · buka jam …" dan pesan tidak bisa dikirim', async () => {
    db.settings = makeSettings({ isOpen: false });
    const user = userEvent.setup();
    await openMenu();
    expect(screen.getByTestId('open-status')).toHaveTextContent('Sedang tutup · buka jam 08.00');
    expect(screen.getByText(/Restoran sedang tutup/)).toBeInTheDocument();
    await user.click(within(screen.getByTestId('item-9')).getByRole('button', { name: 'Tambah Kerupuk' }));
    await user.click(screen.getByTestId('cart-bar'));
    const btn = await screen.findByRole('button', { name: /Lanjut ke alamat/ });
    expect(btn).toBeDisabled();
  });

  it('ganti bahasa ke English', async () => {
    const user = userEvent.setup();
    await openMenu();
    await user.click(screen.getByRole('radio', { name: 'English' }));
    expect(await screen.findByRole('heading', { name: 'Best sellers' })).toBeInTheDocument();
    expect(screen.getAllByRole('article', { name: 'Fried Chicken' }).length).toBeGreaterThan(0);
    expect(document.documentElement.lang).toBe('en');
  });
});

describe('MenuPage (tablet, SKILL §8b)', () => {
  it('≥ 840px: keranjang jadi panel samping (tanpa bar keranjang), tombol lanjut langsung tersedia', async () => {
    const user = userEvent.setup();
    window.innerWidth = 1024;
    try {
      await openMenu();
      const pane = screen.getByTestId('cart-pane');
      expect(within(pane).getByRole('heading', { name: 'Pesanan Anda' })).toBeInTheDocument();
      expect(within(pane).getByText('Keranjang masih kosong')).toBeInTheDocument();
      await user.click(within(screen.getByTestId('item-9')).getByRole('button', { name: 'Tambah Kerupuk' }));
      expect(screen.queryByTestId('cart-bar')).toBeNull();
      expect(within(pane).getByRole('group', { name: 'Jumlah Kerupuk' })).toHaveTextContent('1');
      expect(within(pane).getByRole('button', { name: /Lanjut ke alamat/ })).toBeEnabled();
      // Tidak ada tombol kembali / "Tambah menu lain" di panel.
      expect(within(pane).queryByRole('button', { name: 'Kembali ke menu' })).toBeNull();
    } finally {
      window.innerWidth = 390;
    }
  });
});
