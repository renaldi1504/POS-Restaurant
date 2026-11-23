import { describe, expect, it } from 'vitest';
import { clearStale } from './LangFields';

describe('clearStale (terjemah ulang saat teks Indonesia diubah)', () => {
  const orig = { id: 'Nasi putih', en: 'Steamed rice', kh: 'បាយស', zh: '白米饭' };

  it('teks Indonesia tidak berubah → terjemahan dipertahankan', () => {
    expect(clearStale({ ...orig }, orig)).toEqual(orig);
  });

  it('teks Indonesia berubah → terjemahan lama dikosongkan, yang diedit manual dipertahankan', () => {
    expect(clearStale({ ...orig, id: 'Nasi uduk', en: 'Coconut rice' }, orig)).toEqual({
      id: 'Nasi uduk',
      en: 'Coconut rice',
    });
  });

  it('opsi baru (tanpa asli) tidak diubah', () => {
    expect(clearStale({ id: 'Telur' }, undefined)).toEqual({ id: 'Telur' });
  });
});
