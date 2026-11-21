import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { DriverOrderDto } from '@pos/shared';
import { fx, makeDriverOrder } from '../../test/fixtures';
import { renderApp } from '../../test/render';
import { http, HttpResponse, server } from '../../test/server';
import DriverPage from './DriverPage';

describe('Aplikasi driver – alur Ambil', () => {
  it('Ambil → pindah ke Antaran saya → Sudah diambil → Sudah sampai (tagih cash)', async () => {
    let available: DriverOrderDto[] = [makeDriverOrder()];
    let mine: DriverOrderDto[] = [];
    let collected: unknown = null;
    server.use(
      http.get('*/api/auth/me', () => HttpResponse.json({ user: { ...fx.driver, lang: 'id' } })),
      http.get('*/api/driver/available', () => HttpResponse.json({ orders: available })),
      http.get('*/api/driver/mine', () =>
        HttpResponse.json({ orders: mine, navigateAllUrl: null, cashCarried: mine.length ? 0 : collected ? 42000 : 0, deliveredCount: 0 }),
      ),
      http.post('*/api/driver/orders/:id/take', () => {
        const o = { ...available[0]!, driver: { id: 5, name: 'Driver' } };
        available = [];
        mine = [o];
        return HttpResponse.json({ order: o });
      }),
      http.post('*/api/driver/orders/:id/picked', () => {
        mine = [{ ...mine[0]!, status: 'picked_up' }];
        return HttpResponse.json({ order: mine[0] });
      }),
      http.post('*/api/driver/orders/:id/delivered', async ({ request }) => {
        collected = await request.json();
        const o = { ...mine[0]!, status: 'delivered' as const };
        mine = [];
        return HttpResponse.json({ order: o });
      }),
    );
    renderApp(<DriverPage />);
    const card = await screen.findByTestId('driver-card');
    expect(within(card).getByText('Jl. Ekareach 12')).toBeInTheDocument();
    expect(within(card).getByText('3,1 km')).toBeInTheDocument();
    expect(within(card).getByText('Tagih cash')).toBeInTheDocument();
    expect(screen.getAllByTestId('map-pin')).toHaveLength(1);
    await userEvent.click(within(card).getByRole('button', { name: 'Ambil antaran ini' }));

    expect(await screen.findByRole('tab', { name: 'Antaran saya (1)', selected: true })).toBeInTheDocument();
    const mineCard = await screen.findByTestId('driver-card');
    expect(within(mineCard).getByRole('link', { name: 'Navigasi' })).toHaveAttribute('href', 'https://www.google.com/maps/dir/?api=1&destination=10.64,103.51');
    expect(within(mineCard).getByRole('link', { name: 'Telepon' })).toHaveAttribute('href', 'tel:012999888');
    expect(within(mineCard).getByRole('link', { name: 'Chat Telegram' })).toHaveAttribute('href', 'https://t.me/sokha');
    await userEvent.click(within(mineCard).getByRole('button', { name: 'Sudah diambil' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Sudah sampai' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('42.000 ៛');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Sudah sampai' }));
    expect(await screen.findByText('Belum ada antaran')).toBeInTheDocument();
    expect(collected).toEqual({ collected: { currency: 'KHR', amount: 42000 } });
  });

  it('keduluan driver lain → pesan ALREADY_TAKEN', async () => {
    server.use(
      http.get('*/api/auth/me', () => HttpResponse.json({ user: { ...fx.driver, lang: 'id' } })),
      http.get('*/api/driver/available', () => HttpResponse.json({ orders: [makeDriverOrder()] })),
      http.get('*/api/driver/mine', () => HttpResponse.json({ orders: [], navigateAllUrl: null, cashCarried: 0, deliveredCount: 0 })),
      http.post('*/api/driver/orders/:id/take', () => HttpResponse.json({ error: { code: 'ALREADY_TAKEN', message: 'taken' } }, { status: 409 })),
    );
    renderApp(<DriverPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Ambil antaran ini' }));
    expect(await screen.findByText('Pesanan sudah diambil driver lain')).toBeInTheDocument();
  });

  it('bahasa default dari user.lang (kh)', async () => {
    server.use(
      http.get('*/api/auth/me', () => HttpResponse.json({ user: fx.driver })),
      http.get('*/api/driver/available', () => HttpResponse.json({ orders: [] })),
      http.get('*/api/driver/mine', () => HttpResponse.json({ orders: [], navigateAllUrl: null, cashCarried: 0, deliveredCount: 0 })),
    );
    renderApp(<DriverPage />);
    expect(await screen.findByRole('heading', { name: 'ការដឹកជញ្ជូន' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'ខ្មែរ' })).toHaveAttribute('aria-checked', 'true');
  });
});
