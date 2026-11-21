import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { closingPreview, fx } from '../../test/fixtures';
import { renderApp } from '../../test/render';
import { moneyCtxFrom } from '../../lib/data';
import { ClosingResultView } from './ClosingPage';

const money = moneyCtxFrom(fx.publicSettings);

describe('Closing – langkah 3 (hasil)', () => {
  it('menampilkan selisih kurang, rumus modal + jual − keluar, dan catatan wajib', () => {
    renderApp(
      <ClosingResultView
        preview={closingPreview}
        money={money}
        actualCash={{ KHR: 1033000, USD: 2000, IDR: 0 }}
        abaMain={555000}
        note=""
        onNote={() => {}}
        noteError
      />,
    );
    const cash = screen.getByTestId('cash-result');
    expect(cash).toHaveTextContent('Kurang 5.000 ៛');
    expect(cash).toHaveTextContent('Seharusnya1.120.000 ៛');
    expect(screen.getByTestId('cash-counted')).toHaveTextContent('1.115.000 ៛');
    expect(cash).toHaveTextContent('Modal 332.000 + jual cash 858.000 − keluar cash 70.000');
    expect(screen.getByTestId('aba-result')).toHaveTextContent('Cocok');
    expect(screen.getByLabelText('Catatan selisih (wajib)')).toBeInTheDocument();
    expect(screen.getByText('Ada selisih, wajib isi catatan')).toBeInTheDocument();
    // setoran driver
    expect(screen.getByText('4 antaran · bawa 96.000 ៛')).toBeInTheDocument();
    expect(screen.getByText('Sudah setor')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tandai setor' })).toBeInTheDocument();
    // ringkasan
    expect(screen.getByText('858.000 · 640.000')).toBeInTheDocument();
    expect(screen.getByText('210.000 · 95.000')).toBeInTheDocument();
  });

  it('cash lebih & ABA kurang', () => {
    renderApp(
      <ClosingResultView
        preview={closingPreview}
        money={money}
        actualCash={{ KHR: 1130000, USD: 0, IDR: 0 }}
        abaMain={550000}
        note="x"
        onNote={() => {}}
        noteError={false}
      />,
    );
    expect(screen.getByTestId('cash-result')).toHaveTextContent('Lebih 10.000 ៛');
    expect(screen.getByTestId('aba-result')).toHaveTextContent('Kurang 5.000 ៛');
  });
});
