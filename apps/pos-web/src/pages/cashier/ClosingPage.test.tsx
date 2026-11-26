import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { Currency } from '@pos/shared';
import { closingPreview, fx } from '../../test/fixtures';
import { renderApp } from '../../test/render';
import { moneyCtxFrom } from '../../lib/data';
import { defaultKeep } from '../../lib/closing';
import { ClosingResultView } from './ClosingPage';

const money = moneyCtxFrom(fx.publicSettings);

function view(over: {
  cash?: Record<Currency, number>;
  aba?: Partial<Record<Currency, number>>;
  kept?: Record<Currency, number>;
  noteError?: boolean;
}) {
  const cash = over.cash ?? { KHR: 1033000, USD: 2000, IDR: 0 };
  return renderApp(
    <ClosingResultView
      preview={closingPreview}
      money={money}
      actualCash={cash}
      actualAba={over.aba ?? { KHR: 555000, USD: 1500 }}
      kept={over.kept ?? defaultKeep(closingPreview.suggestedKeep, cash)}
      onKept={() => {}}
      note=""
      onNote={() => {}}
      noteError={over.noteError ?? true}
    />,
  );
}

describe('Closing – langkah 3 (hasil per kantong)', () => {
  it('selisih per kantong tanpa kurs: Cash Riel kurang, lainnya cocok; rincian hitungan; catatan wajib', async () => {
    view({});
    const khr = screen.getByTestId('pocket-cash-KHR');
    expect(khr).toHaveTextContent('Cash Riel');
    expect(khr).toHaveTextContent('Kurang 5.000 ៛');
    expect(khr).toHaveTextContent('Seharusnya1.038.000 ៛');
    expect(screen.getByTestId('pocket-cash-USD')).toHaveTextContent('Cocok');
    expect(screen.getByTestId('pocket-aba-KHR')).toHaveTextContent('Cocok');
    expect(screen.getByTestId('pocket-aba-USD')).toHaveTextContent('Cocok');
    await userEvent.click(within(khr).getByRole('button', { name: 'Cara menghitung' }));
    expect(within(khr).getByTestId('pocket-explain')).toHaveTextContent(
      'Modal 250.000 + diterima 860.000 − kembalian 2.000 − pengeluaran 70.000',
    );
    expect(screen.getByLabelText('Catatan selisih (wajib)')).toBeInTheDocument();
    // setoran driver harus beres dulu
    expect(screen.getByText('Uang driver harus disetor dulu sebelum closing.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tandai setor' })).toBeInTheDocument();
  });

  it('ABA $ kurang terlihat sendiri walau ABA Riel cocok', () => {
    view({ cash: { KHR: 1038000, USD: 2000, IDR: 0 }, aba: { KHR: 555000, USD: 1000 }, noteError: false });
    expect(screen.getByTestId('pocket-aba-USD')).toHaveTextContent('Kurang $5.00');
    expect(screen.getByTestId('pocket-aba-KHR')).toHaveTextContent('Cocok');
  });

  it('ditinggal di laci = modal tetap, sisanya disetor ke owner', () => {
    view({ cash: { KHR: 1038000, USD: 2000, IDR: 0 } });
    expect(screen.getByTestId('deposit-KHR')).toHaveTextContent('938.000 ៛');
    expect(screen.getByTestId('deposit-USD')).toHaveTextContent('$0.00');
  });
});
