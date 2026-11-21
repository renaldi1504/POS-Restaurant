import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import type { Currency } from '@pos/shared';
import { fx, makeOrder } from '../../test/fixtures';
import { renderApp } from '../../test/render';
import { http, HttpResponse, server } from '../../test/server';
import { moneyCtxFrom } from '../../lib/data';
import PaymentPage, { CashPanel } from './PaymentPage';

function Host({ due }: { due: number }) {
  const [cur, setCur] = useState<Currency>('KHR');
  const [rec, setRec] = useState<number | null>(null);
  return <CashPanel dueMain={due} money={moneyCtxFrom(fx.publicSettings)} currency={cur} onCurrency={setCur} received={rec} onReceived={setRec} />;
}

describe('Bayar – kembalian tunai', () => {
  it('uang cepat 100.000 ៛ → kembalian 58.000 ៛ (≈ $14.15)', async () => {
    renderApp(<Host due={42000} />);
    await userEvent.click(screen.getByRole('button', { name: '100.000 ៛' }));
    expect(screen.getByText('Diterima 100.000 ៛')).toBeInTheDocument();
    expect(screen.getByTestId('change-amount')).toHaveTextContent('58.000 ៛');
    expect(screen.getByText('atau ≈ $14.15')).toBeInTheDocument();
  });

  it('uang pas → kembalian 0; ketik jumlah kurang → peringatan', async () => {
    renderApp(<Host due={42000} />);
    await userEvent.click(screen.getByRole('button', { name: 'Uang pas' }));
    expect(screen.getByTestId('change-amount')).toHaveTextContent('0 ៛');
    await userEvent.click(screen.getByRole('button', { name: 'Ketik jumlah lain' }));
    await userEvent.type(screen.getByLabelText('Jumlah diterima'), '20000');
    expect(screen.getByRole('alert')).toHaveTextContent('Uang kurang 22.000 ៛');
  });

  it('bayar dengan dollar: uang pas $10.25, $20 → kembalian 40.000 ៛', async () => {
    renderApp(<Host due={42000} />);
    await userEvent.click(screen.getByRole('radio', { name: 'Dollar $' }));
    expect(screen.getByText('Harus dibayar: $10.25')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '$20.00' }));
    expect(screen.getByTestId('change-amount')).toHaveTextContent('40.000 ៛');
  });

  it('alur lengkap: kirim pembayaran cash lalu tampil kembalian & struk', async () => {
    const order = makeOrder({ total: 42000, subtotal: 42000 });
    let body: unknown = null;
    server.use(
      http.get('*/api/orders/:id', () => HttpResponse.json({ order })),
      http.post('*/api/payments', async ({ request }) => {
        body = await request.json();
        const paid = makeOrder({
          total: 42000,
          subtotal: 42000,
          paymentStatus: 'paid',
          paidMain: 42000,
          payments: [{ id: 1, orderId: order.id, tableSessionId: null, method: 'cash', currency: 'KHR', amount: 50000, amountMain: 50000, changeMain: 8000, proofUrl: null, verifiedBy: null, verifiedAt: null, createdBy: null, createdAt: order.createdAt }],
        });
        return HttpResponse.json({ payments: paid.payments, paidMain: 50000, changeMain: 8000, remainingMain: 0, order: paid, session: null });
      }),
    );
    renderApp(<PaymentPage />, { route: `/kasir/bayar/${order.id}`, path: '/kasir/bayar/:orderId' });
    expect(await screen.findByTestId('pay-total')).toHaveTextContent('42.000 ៛');
    const finish = screen.getByRole('button', { name: 'Selesai · cetak struk' });
    expect(finish).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: '50.000 ៛' }));
    await userEvent.click(finish);
    expect(await screen.findByTestId('done-change')).toHaveTextContent('8.000 ៛');
    expect(body).toEqual({ orderId: order.id, lines: [{ method: 'cash', currency: 'KHR', amount: 50000 }], partial: false });
    await waitFor(() => expect(screen.getByTestId('receipt-preview')).toHaveTextContent(/Kembalian\s+8\.000 KHR/));
  });
});
