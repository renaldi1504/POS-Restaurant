import { act, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { PublicOrderDto } from '@pos/shared';
import { makeOrder } from '../test/fixtures';
import { renderApp } from '../test/render';
import { db } from '../test/server';
import { emitSocket } from '../test/socketMock';

function show(over: Partial<PublicOrderDto>) {
  const o = makeOrder(over);
  db.orders.set(o.id, o);
  renderApp(`/pesanan/${o.id}`);
  return o;
}

function stepStates() {
  return within(screen.getByTestId('status-steps'))
    .getAllByRole('listitem')
    .map((li) => `${(li.textContent ?? '').replace(/^\d/, '')}:${li.getAttribute('data-state')}`);
}

describe('Halaman status pesanan', () => {
  it('menunggu diterima', async () => {
    show({ status: 'pending_accept' });
    expect(await screen.findByTestId('status-pending')).toHaveTextContent(
      'Menunggu restoran menerima pesanan',
    );
    expect(screen.getByText('Pesanan #12 · Delivery')).toBeInTheDocument();
    expect(screen.queryByTestId('status-steps')).toBeNull();
  });

  it('dimasak → langkah aktif kedua', async () => {
    show({ status: 'cooking' });
    await screen.findByTestId('status-steps');
    expect(stepStates()).toEqual(['Diterima:done', 'Dimasak:current', 'Diantar:todo', 'Selesai:todo']);
  });

  it('delivery siap → menunggu driver; diantar → nama driver', async () => {
    const o = show({ status: 'ready' });
    await screen.findByTestId('status-steps');
    expect(stepStates()[2]).toBe('Siap · menunggu driver:current');
    act(() =>
      emitSocket('order.updated', {
        order: { ...o, status: 'picked_up', driverName: 'Sokha' },
        at: new Date().toISOString(),
      }),
    );
    expect(await screen.findByText('Driver Sokha sedang menuju alamat Anda')).toBeInTheDocument();
  });

  it('ambil sendiri: siap → disajikan', async () => {
    show({ status: 'served', type: 'takeaway', address: null });
    await screen.findByTestId('status-steps');
    expect(stepStates()).toEqual(['Diterima:done', 'Dimasak:done', 'Disajikan:current', 'Selesai:todo']);
  });

  it('selesai', async () => {
    show({ status: 'done' });
    expect(await screen.findByText('Terima kasih!')).toBeInTheDocument();
    expect(stepStates().every((s) => s.endsWith(':done'))).toBe(true);
  });

  it('ditolak dengan alasan', async () => {
    show({ status: 'rejected', rejectReason: 'Stok ayam habis' });
    const card = await screen.findByTestId('status-rejected');
    expect(card).toHaveTextContent('Pesanan ditolak');
    expect(card).toHaveTextContent('Alasan: Stok ayam habis');
  });

  it('ABA tanpa bukti → bisa upload dari halaman status', async () => {
    show({ status: 'pending_accept', paymentMethod: 'aba' });
    const sec = await screen.findByTestId('proof-needed');
    expect(sec).toHaveTextContent('Upload bukti transfer ABA agar pesanan diproses');
    expect(within(sec).getByLabelText('Upload bukti transfer')).toBeInTheDocument();
  });

  it('pesanan tidak ditemukan', async () => {
    renderApp('/pesanan/99999999-9999-4999-8999-999999999999');
    expect(await screen.findByText('Pesanan tidak ditemukan')).toBeInTheDocument();
  });
});
