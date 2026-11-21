import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { Button, MoneyText, Segmented, Stepper } from './index';

describe('UI kit', () => {
  it('Stepper increments/decrements within bounds', async () => {
    function Host() {
      const [v, setV] = useState(1);
      return <Stepper value={v} onChange={setV} min={1} max={3} label="Ayam Goreng" />;
    }
    render(<Host />);
    const minus = screen.getByRole('button', { name: 'Kurangi Ayam Goreng' });
    const plus = screen.getByRole('button', { name: 'Tambah Ayam Goreng' });
    expect(minus).toBeDisabled();
    await userEvent.click(plus);
    await userEvent.click(plus);
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(plus).toBeDisabled();
  });

  it('MoneyText formats with equivalents', () => {
    render(
      <MoneyText amount={41000} currency="KHR" equivalents={['USD']} rates={{ USD: 4100, IDR: 0.25 }} />,
    );
    expect(screen.getByText('41.000 ៛')).toBeInTheDocument();
    expect(screen.getByText('≈ $10.00')).toBeInTheDocument();
  });

  it('Segmented exposes radio semantics', async () => {
    function Host() {
      const [v, setV] = useState<'a' | 'b'>('a');
      return (
        <Segmented
          label="Tipe"
          value={v}
          onChange={setV}
          options={[
            { value: 'a', label: 'Makan sini' },
            { value: 'b', label: 'Bungkus' },
          ]}
        />
      );
    }
    render(<Host />);
    await userEvent.click(screen.getByRole('radio', { name: 'Bungkus' }));
    expect(screen.getByRole('radio', { name: 'Bungkus' })).toHaveAttribute('aria-checked', 'true');
  });

  it('Button shows loading state', () => {
    render(<Button loading>Bayar</Button>);
    expect(screen.getByRole('button', { name: 'Bayar' })).toBeDisabled();
  });
});
