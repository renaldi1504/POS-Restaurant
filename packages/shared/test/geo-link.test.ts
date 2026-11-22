import { describe, expect, it } from 'vitest';
import { isAllowedMapsUrl, needsServerResolve, parseLocationText } from '../src/geo';

describe('parseLocationText — titik dari link/teks yang ditempel', () => {
  const cases: [string, { lat: number; lng: number } | null][] = [
    ['10.61,103.52', { lat: 10.61, lng: 103.52 }],
    ['  10.6123, 103.5234 ', { lat: 10.6123, lng: 103.5234 }],
    ['10.61 103.52', { lat: 10.61, lng: 103.52 }],
    ['-6.2, 106.8', { lat: -6.2, lng: 106.8 }],
    ['https://maps.google.com/?q=10.61,103.52', { lat: 10.61, lng: 103.52 }],
    ['https://www.google.com/maps?q=10.61%2C103.52&z=17', { lat: 10.61, lng: 103.52 }],
    ['https://maps.google.com/maps?q=loc:10.61,103.52', { lat: 10.61, lng: 103.52 }],
    ['https://www.google.com/maps/search/?api=1&query=10.62,103.51', { lat: 10.62, lng: 103.51 }],
    ['https://maps.google.com/?ll=10.63,103.54&z=15', { lat: 10.63, lng: 103.54 }],
    ['https://www.google.com/maps/dir/?api=1&destination=10.6,103.5', { lat: 10.6, lng: 103.5 }],
    ['https://www.google.com/maps/@10.6271,103.5221,17z', { lat: 10.6271, lng: 103.5221 }],
    [
      'https://www.google.com/maps/place/Cafe/@10.6271,103.5221,17z/data=!3m1!4b1!4m6!3m5!8m2!3d10.6275!4d103.5225',
      { lat: 10.6275, lng: 103.5225 },
    ],
    ['https://www.google.com/maps/search/10.6,+103.5', { lat: 10.6, lng: 103.5 }],
    [
      'https://www.openstreetmap.org/?mlat=10.61&mlon=103.52#map=17/10.61/103.52',
      { lat: 10.61, lng: 103.52 },
    ],
    ['https://www.openstreetmap.org/#map=17/10.615/103.525', { lat: 10.615, lng: 103.525 }],
    ['geo:10.61,103.52?z=16', { lat: 10.61, lng: 103.52 }],
    ['Lokasi saya: https://maps.google.com/?q=10.61,103.52 terima kasih', { lat: 10.61, lng: 103.52 }],
    ['https://maps.apple.com/?ll=10.61,103.52&q=Pin', { lat: 10.61, lng: 103.52 }],
    // tidak berisi titik
    ['https://maps.app.goo.gl/AbCd123', null],
    ['https://www.google.com/maps/place/Victory+Beach', null],
    ['012 345', null],
    ['012 123', null],
    ['Jl. Ekareach 12', null],
    ['', null],
    ['95.5, 103.5', null],
    ['0.0, 0.0', null],
  ];
  for (const [input, want] of cases) {
    it(JSON.stringify(input), () => expect(parseLocationText(input)).toEqual(want));
  }
});

describe('isAllowedMapsUrl / needsServerResolve', () => {
  it('hanya host Google Maps', () => {
    const ok = (s: string) => isAllowedMapsUrl(new URL(s));
    expect(ok('https://maps.app.goo.gl/x')).toBe(true);
    expect(ok('https://goo.gl/maps/abc')).toBe(true);
    expect(ok('https://maps.google.com/x')).toBe(true);
    expect(ok('https://www.google.com/maps/place/x')).toBe(true);
    expect(ok('https://google.com/maps')).toBe(true);
    expect(ok('https://goo.gl/abc')).toBe(false);
    expect(ok('https://www.google.com/search?q=x')).toBe(false);
    expect(ok('https://maps.app.goo.gl.evil.com/x')).toBe(false);
    expect(ok('https://user@maps.app.goo.gl/x')).toBe(false);
    expect(ok('https://maps.google.com:444/x')).toBe(false);
    expect(ok('ftp://maps.google.com/x')).toBe(false);
  });
  it('link pendek → perlu server; link berisi titik / bukan Google → tidak', () => {
    expect(needsServerResolve('cek https://maps.app.goo.gl/AbC1')).toBe('https://maps.app.goo.gl/AbC1');
    expect(needsServerResolve('https://maps.google.com/?q=10.61,103.52')).toBeNull();
    expect(needsServerResolve('https://evil.com/x')).toBeNull();
    expect(needsServerResolve('hello')).toBeNull();
  });
});
