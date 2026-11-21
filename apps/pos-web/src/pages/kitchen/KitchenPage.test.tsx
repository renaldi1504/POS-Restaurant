import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { fx, makeOrder } from '../../test/fixtures';
import { renderApp } from '../../test/render';
import { http, HttpResponse, server } from '../../test/server';
import KitchenPage, { kitchenTone } from './KitchenPage';

describe('Layar dapur', () => {
  it('ganti bahasa layar per perangkat: UI & nama menu ikut berubah', async () => {
    const acceptedAt = new Date(Date.now() - 2 * 60_000).toISOString();
    server.use(
      http.get('*/api/auth/me', () => HttpResponse.json({ user: fx.kitchen })),
      http.get('*/api/orders', () =>
        HttpResponse.json({ orders: [makeOrder({ status: 'accepted', acceptedAt, type: 'dine_in', table: { id: 2, name: 'Meja 2' } })], serverTime: new Date().toISOString() }),
      ),
    );
    renderApp(<KitchenPage />);
    expect(await screen.findByRole('heading', { name: 'Dapur' })).toBeInTheDocument();
    const card = await screen.findByTestId('kitchen-card');
    expect(within(card).getByText('Ayam Goreng')).toBeInTheDocument();
    expect(within(card).getByText('Paha atas')).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: 'Mulai masak' })).toBeInTheDocument();
    expect(within(screen.getByTestId('kitchen-recap')).getByText(/Ayam Goreng/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('radio', { name: 'EN' }));
    expect(screen.getByRole('heading', { name: 'Kitchen' })).toBeInTheDocument();
    expect(within(card).getByText('Fried Chicken')).toBeInTheDocument();
    expect(within(card).getByText('Thigh')).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: 'Start cooking' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('radio', { name: 'ខ្មែរ' }));
    expect(screen.getByTestId('kitchen-screen')).toHaveAttribute('lang', 'kh');
    expect(within(card).getByText('មាន់បំពង')).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: 'ចាប់ផ្តើមចម្អិន' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('radio', { name: '中文' }));
    expect(within(card).getByText('炸鸡')).toBeInTheDocument();
    expect(localStorage.getItem('pos.prefs')).toContain('"kitchenLang":"zh"');
  });

  it('warna kartu: baru kuning, dimasak biru, terlambat merah', () => {
    const now = Date.now();
    const ago = (m: number) => new Date(now - m * 60_000).toISOString();
    expect(kitchenTone({ status: 'accepted', acceptedAt: ago(2), createdAt: ago(2) }, 15, now)).toBe('new');
    expect(kitchenTone({ status: 'cooking', acceptedAt: ago(9), createdAt: ago(9) }, 15, now)).toBe('cooking');
    expect(kitchenTone({ status: 'cooking', acceptedAt: ago(18), createdAt: ago(18) }, 15, now)).toBe('late');
  });

  it('Mulai masak mengirim status cooking', async () => {
    let sent: unknown = null;
    let status: 'accepted' | 'cooking' = 'accepted';
    server.use(
      http.get('*/api/auth/me', () => HttpResponse.json({ user: fx.kitchen })),
      http.get('*/api/orders', () => HttpResponse.json({ orders: [makeOrder({ status, acceptedAt: new Date().toISOString() })], serverTime: new Date().toISOString() })),
      http.post('*/api/orders/:id/status', async ({ request }) => {
        sent = await request.json();
        status = 'cooking';
        return HttpResponse.json({ order: makeOrder({ status: 'cooking' }) });
      }),
    );
    renderApp(<KitchenPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Mulai masak' }));
    expect(await screen.findByRole('button', { name: 'Siap' })).toBeInTheDocument();
    expect(sent).toEqual({ status: 'cooking' });
  });
});
