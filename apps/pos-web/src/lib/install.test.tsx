import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { InstallAppButton } from '../components/common/InstallAppButton';
import { isIos } from './install';

describe('pasang aplikasi (PWA)', () => {
  it('deteksi iPhone', () => {
    expect(isIos('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)')).toBe(true);
    expect(isIos('Mozilla/5.0 (Linux; Android 14)')).toBe(false);
  });

  it('tanpa prompt browser → petunjuk langkah; dengan prompt → dialog pasang bawaan', async () => {
    const user = userEvent.setup();
    render(<InstallAppButton />);
    await user.click(screen.getByRole('button', { name: 'Pasang aplikasi di HP ini' }));
    expect(screen.getByText('Buka halaman ini di Chrome.')).toBeInTheDocument();

    const prompt = vi.fn(async () => undefined);
    const ev = Object.assign(new Event('beforeinstallprompt'), {
      prompt,
      userChoice: Promise.resolve({ outcome: 'accepted' as const }),
    });
    act(() => {
      window.dispatchEvent(ev);
    });
    await user.click(screen.getAllByRole('button', { name: 'Pasang aplikasi di HP ini' })[0]!);
    expect(prompt).toHaveBeenCalled();
  });
});
