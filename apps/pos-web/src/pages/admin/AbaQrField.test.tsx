/** Settings → Rekening ABA: gambar QR di-upload (potong 1:1), dipratinjau, diganti & dihapus. */
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, type AdminSettingsResponse } from '@pos/shared';
import { renderApp } from '../../test/render';
import { http, HttpResponse, server } from '../../test/server';
import type * as Crop from '../../lib/crop';
import { AbaQrField } from './SettingsPage';

// Pemotong foto asli butuh canvas/ukuran layout (tidak ada di jsdom): area potong langsung "selesai".
vi.mock('react-easy-crop', () => ({
  default: function FakeCropper(props: {
    aspect: number;
    onCropComplete: (a: unknown, px: { x: number; y: number; width: number; height: number }) => void;
  }) {
    const { onCropComplete, aspect } = props;
    useEffect(() => onCropComplete({}, { x: 0, y: 0, width: 300, height: 300 }), [onCropComplete]);
    return <div data-testid="fake-cropper" data-aspect={aspect} />;
  },
}));
vi.mock('../../lib/crop', async (orig) => ({
  ...(await orig<typeof Crop>()),
  loadImage: async () => ({}) as HTMLImageElement,
  cropToBlob: async () => ({ blob: new Blob(['x'], { type: 'image/jpeg' }), type: 'image/jpeg' }),
}));

const QR = '/uploads/public/aba-qr/abc.jpg';
const settingsWith = (qrImageUrl: string | null): AdminSettingsResponse => ({
  settings: {
    ...DEFAULT_SETTINGS,
    payment: { aba: { accountName: 'RM BERKAT', accountNumber: '000 111', qrImageUrl } },
  },
  integrations: { telegram: false, telegramBotUsername: null, gemini: false, maps: false, r2: false },
});

function Host({ onChange }: { onChange: (u: string | null) => void }) {
  const [url, setUrl] = useState<string | null>(null);
  return (
    <AbaQrField
      url={url}
      onChange={(u) => {
        setUrl(u);
        onChange(u);
      }}
    />
  );
}

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => 'blob:preview');
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => vi.restoreAllMocks());

describe('AbaQrField', () => {
  it('upload → potong 1:1 → pratinjau; ganti & hapus', async () => {
    const user = userEvent.setup();
    const uploads: string[] = [];
    let deleted = 0;
    server.use(
      http.post('*/api/admin/settings/aba-qr', ({ request }) => {
        uploads.push(request.headers.get('content-type')?.split(';')[0] ?? '');
        return HttpResponse.json(settingsWith(QR));
      }),
      http.delete('*/api/admin/settings/aba-qr', () => {
        deleted++;
        return HttpResponse.json(settingsWith(null));
      }),
    );
    const onChange = vi.fn();
    renderApp(<Host onChange={onChange} />);

    // Bukan kolom URL lagi.
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.getByText('Belum ada gambar QR')).toBeInTheDocument();

    await user.upload(screen.getByTestId('photo-input'), new File(['png'], 'qr.png', { type: 'image/png' }));
    const crop = await screen.findByRole('dialog', { name: 'Atur foto' });
    expect(within(crop).getByTestId('fake-cropper')).toHaveAttribute('data-aspect', '1');
    await user.click(within(crop).getByRole('button', { name: 'Pakai foto' }));

    await waitFor(() => expect(onChange).toHaveBeenCalledWith(QR));
    expect(uploads).toEqual(['multipart/form-data']);
    expect(screen.getByRole('img', { name: 'Gambar QR ABA' })).toHaveAttribute('src', QR);
    expect(screen.getByRole('button', { name: 'Ganti QR' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Hapus QR' }));
    const confirm = await screen.findByRole('dialog', { name: 'Hapus QR' });
    await user.click(within(confirm).getByRole('button', { name: 'Hapus' }));
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith(null));
    expect(deleted).toBe(1);
    expect(screen.queryByRole('img', { name: 'Gambar QR ABA' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Upload QR' })).toBeInTheDocument();
  });
});
