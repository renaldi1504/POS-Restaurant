import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { RangeReport } from '@pos/shared';
import { ReportBody } from './ReportsPage';

const r: RangeReport = {
  from: '2026-11-16',
  to: '2026-11-17',
  days: 2,
  currency: 'KHR',
  totalSales: 100000,
  netSales: 95000,
  expensesTotal: 30000,
  grossProfit: 65000,
  orderCount: 8,
  averageOrder: 12500,
  cancelledCount: 1,
  unpaid: { count: 0, total: 0 },
  byDay: [
    { date: '2026-11-16', sales: 60000, expenses: 10000, orders: 5 },
    { date: '2026-11-17', sales: 40000, expenses: 20000, orders: 3 },
  ],
  byChannel: [],
  byMethod: [],
  topItems: [
    { itemId: 1, name: { id: 'Ayam Goreng' }, qty: 6, total: 60000 },
    { itemId: 2, name: { id: 'Es Teh' }, qty: 4, total: 16000 },
  ],
  expensesByCategory: [{ category: 'Belanja pasar', total: 30000, count: 2 }],
  previous: {
    from: '2026-11-14',
    to: '2026-11-15',
    totalSales: 50000,
    netSales: 50000,
    expensesTotal: 40000,
    grossProfit: 10000,
    orderCount: 4,
  },
};

describe('Laporan owner', () => {
  it('KPI dengan perbandingan, menu terlaris, pengeluaran per kategori', () => {
    render(<ReportBody r={r} lang="id" />);
    const sales = screen.getByTestId('kpi-sales');
    expect(sales).toHaveTextContent('100.000');
    expect(sales).toHaveTextContent('+100%');
    expect(screen.getByTestId('kpi-expenses')).toHaveTextContent('-25%');
    expect(screen.getByTestId('kpi-profit')).toHaveTextContent('65.000');
    const top = screen.getByTestId('top-items');
    expect(within(top).getByText('Ayam Goreng')).toBeInTheDocument();
    expect(within(top).getByText('6 porsi')).toBeInTheDocument();
    expect(within(screen.getByTestId('expenses-by-category')).getByText(/Belanja pasar/)).toBeInTheDocument();
  });
});
