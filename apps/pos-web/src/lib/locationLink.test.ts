import { describe, expect, it, vi } from 'vitest';
import { formatPoint, locateFromText, looksLikeLocation } from './locationLink';

const never = vi.fn(async () => {
  throw new Error('server tidak boleh dipanggil');
});

describe('lokasi dari link yang ditempel kasir', () => {
  it.each([
    ['https://maps.google.com/?q=10.61,103.52', 10.61, 103.52],
    ['https://www.google.com/maps/place/X/@10.1,103.1,17z/data=!3d10.62!4d103.53', 10.62, 103.53],
    ['https://www.google.com/maps/search/?api=1&query=10.62%2C103.51', 10.62, 103.51],
    ['https://maps.google.com/maps?ll=10.63,103.54&z=16', 10.63, 103.54],
    ['10.6123, 103.5234', 10.6123, 103.5234],
    ['Ini lokasi saya https://maps.google.com/maps?q=10.6,103.5&z=17', 10.6, 103.5],
  ])('%s → titik (tanpa server)', async (text, lat, lng) => {
    expect(await locateFromText(text, never)).toEqual({
      kind: 'point',
      point: { lat, lng },
      viaServer: false,
    });
  });

  it('link pendek → dibuka server', async () => {
    const resolve = vi.fn(async () => ({ lat: 10.6, lng: 103.5 }));
    expect(await locateFromText('https://maps.app.goo.gl/AbC', resolve)).toEqual({
      kind: 'point',
      point: { lat: 10.6, lng: 103.5 },
      viaServer: true,
    });
    expect(resolve).toHaveBeenCalledWith('https://maps.app.goo.gl/AbC');
    expect(await locateFromText('https://goo.gl/maps/xyz', async () => ({ lat: null, lng: null }))).toEqual({
      kind: 'no_point',
    });
  });

  it('bukan link lokasi / kosong', async () => {
    expect(await locateFromText('https://example.com/x', never)).toEqual({ kind: 'unknown' });
    expect(await locateFromText('Jl. Ekareach', never)).toEqual({ kind: 'unknown' });
    expect(await locateFromText('  ', never)).toEqual({ kind: 'empty' });
    expect(never).not.toHaveBeenCalled();
  });

  it('looksLikeLocation & formatPoint', () => {
    expect(looksLikeLocation('https://maps.app.goo.gl/a')).toBe(true);
    expect(looksLikeLocation('10.6, 103.5')).toBe(true);
    expect(looksLikeLocation('Jl. Ekareach 12')).toBe(false);
    expect(formatPoint({ lat: 10.6, lng: 103.5 })).toBe('10.60000, 103.50000');
  });
});
