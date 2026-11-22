import { describe, expect, it } from 'vitest';
import { PermissionList, StaffUser } from '@pos/shared';
import { fetchLatestBuild, isSafeToReload } from './appUpdate';

describe('versi aplikasi & respons dari server yang lebih baru', () => {
  it('membaca build terbaru dari version.json; gagal → null', async () => {
    const ok = (async () => new Response(JSON.stringify({ build: 'abc' }))) as unknown as typeof fetch;
    expect(await fetchLatestBuild(ok)).toBe('abc');
    const down = (async () => new Response('x', { status: 404 })) as unknown as typeof fetch;
    expect(await fetchLatestBuild(down)).toBeNull();
  });

  it('tidak memuat ulang saat di layar bayar/closing atau sedang mengetik', () => {
    expect(isSafeToReload('/kasir')).toBe(true);
    expect(isSafeToReload('/kasir/bayar')).toBe(false);
    expect(isSafeToReload('/kasir/closing')).toBe(false);
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    expect(isSafeToReload('/kasir')).toBe(false);
    input.remove();
  });

  it('izin baru dari server yang belum dikenal aplikasi lama diabaikan (bukan error)', () => {
    expect(PermissionList.parse(['reports.view', 'izin.masa.depan'])).toEqual(['reports.view']);
    const me = StaffUser.parse({
      id: 1,
      name: 'Owner',
      lang: 'id',
      role: { id: 1, name: 'Owner' },
      permissions: ['reports.view', 'something.new'],
    });
    expect(me.permissions).toEqual(['reports.view']);
  });
});
