import { describe, expect, it } from 'vitest';
import { EscPos, PAPER_COLUMNS, center, toAscii, twoCol, wrap } from './escpos';
import { buildReceipt, renderEscPos, renderText, type ReceiptData } from './receipt';

describe('EscPos encoder', () => {
  it('menghasilkan byte perintah yang benar', () => {
    const bytes = new EscPos(32)
      .init()
      .align('center')
      .bold(true)
      .text('AB')
      .bold(false)
      .double(true)
      .line('C')
      .double(false)
      .feed(2)
      .cut(3)
      .encode();
    expect(Array.from(bytes)).toEqual([
      0x1b,
      0x40, // ESC @
      0x1b,
      0x61,
      0x01, // ESC a 1 (tengah)
      0x1b,
      0x45,
      0x01, // ESC E 1
      0x41,
      0x42, // "AB"
      0x1b,
      0x45,
      0x00,
      0x1d,
      0x21,
      0x11, // GS ! 0x11 (2x lebar & tinggi)
      0x43,
      0x0a, // "C\n"
      0x1d,
      0x21,
      0x00,
      0x1b,
      0x64,
      0x02, // ESC d 2
      0x1d,
      0x56,
      0x42,
      0x03, // GS V 66 3
    ]);
  });

  it('align kiri/kanan dan ukuran dibatasi 1–8', () => {
    expect(Array.from(new EscPos().align('left').align('right').encode())).toEqual([
      0x1b, 0x61, 0, 0x1b, 0x61, 2,
    ]);
    expect(Array.from(new EscPos().size(9, 0).encode())).toEqual([0x1d, 0x21, 0x70]);
  });

  it('hanya mengirim ASCII: diakritik dihapus, ៛ → KHR, Khmer/Mandarin dibuang', () => {
    expect(toAscii('Café 42.000 ៛')).toBe('Cafe 42.000 KHR');
    expect(toAscii('Ayam មាន់ 炸鸡 ok')).toBe('Ayam   ok');
    const bytes = new EscPos().text('é៛').encode();
    expect(Array.from(bytes).every((b) => b >= 0x20 && b <= 0x7e)).toBe(true);
  });
});

describe('tata letak kolom', () => {
  it('twoCol mengisi tepat lebar kolom dengan angka rata kanan', () => {
    const [line] = twoCol('2 Ayam Goreng', '20.000', 32);
    expect(line).toHaveLength(32);
    expect(line!.startsWith('2 Ayam Goreng')).toBe(true);
    expect(line!.endsWith('20.000')).toBe(true);
  });

  it('teks panjang dibungkus, angka di baris terakhir', () => {
    const lines = twoCol('1 Pempek Kapal Selam Spesial Jumbo Pedas', '14.000', 32);
    expect(lines.length).toBeGreaterThan(1);
    lines.forEach((l) => expect(l).toHaveLength(32));
    expect(lines.at(-1)!.endsWith('14.000')).toBe(true);
  });

  it('wrap & center', () => {
    expect(wrap('aaaa bbbb cccc', 9)).toEqual(['aaaa bbbb', 'cccc']);
    expect(center('AB', 6)).toEqual(['  AB  ']);
  });
});

const data: ReceiptData = {
  kind: 'receipt',
  lang: 'id',
  shop: { name: 'Rumah Makan Berkat', address: 'Sihanoukville', phone: '012 345' },
  date: new Date(2026, 10, 21, 12, 41),
  cashier: 'Kasir Pagi',
  table: 'Meja 5',
  orderNo: '#18',
  groups: [
    {
      items: [
        { qty: 2, name: 'Ayam Goreng', options: ['Paha atas', 'Tidak pedas'], total: 20000 },
        { qty: 1, name: 'Pempek Kapal Selam', options: [], note: 'cuko dipisah', total: 14000 },
      ],
    },
  ],
  subtotal: 34000,
  discount: 4000,
  deliveryFee: 0,
  total: 30000,
  currency: 'KHR',
  rates: { USD: 4100, IDR: 0.25 },
  equivalents: ['USD', 'IDR'],
  payments: [{ label: 'Cash KHR', amount: 50000, currency: 'KHR' }],
  change: 20000,
};

describe('template struk', () => {
  for (const paper of [58, 80] as const) {
    it(`semua baris kolom ≤ ${PAPER_COLUMNS[paper]} karakter & angka sejajar kanan (${paper} mm)`, () => {
      const cols = PAPER_COLUMNS[paper];
      const lines = renderText(buildReceipt(data, cols), cols);
      lines.forEach((l) => expect(l.length).toBeLessThanOrEqual(cols));
      const money = lines.filter((l) => /\d\.\d{3}( KHR)?$/.test(l));
      expect(money.length).toBeGreaterThanOrEqual(5);
      money.forEach((l) => expect(l).toHaveLength(cols));
    });
  }

  it('isi struk: total KHR, perkiraan USD/IDR, kembalian, tanpa label nota sementara', () => {
    const text = renderText(buildReceipt(data, 32), 32).join('\n');
    expect(text).toContain('MEJA 5');
    expect(text).toMatch(/TOTAL\s+30\.000 KHR/);
    expect(text).toMatch(/~ USD\s+\$7\.32/);
    expect(text).toMatch(/~ IDR\s+Rp 120\.000/);
    expect(text).toMatch(/Kembalian\s+20\.000 KHR/);
    expect(text).toMatch(/Diskon\s+-4\.000/);
    expect(text).toContain('  Paha atas, Tidak pedas');
    expect(text).not.toContain('NOTA SEMENTARA');
  });

  it('nota sementara memuat label & sisa, berbahasa Inggris bila dipilih', () => {
    const id = renderText(
      buildReceipt({ ...data, kind: 'provisional', payments: undefined, change: undefined }, 32),
      32,
    ).join('\n');
    expect(id).toContain('NOTA SEMENTARA - BELUM BAYAR');
    const en = renderText(
      buildReceipt({ ...data, kind: 'provisional', lang: 'en', payments: undefined }, 48),
      48,
    ).join('\n');
    expect(en).toContain('PROVISIONAL BILL - UNPAID');
    expect(en).toContain('Thank you!');
  });

  it('byte ESC/POS diawali init, diakhiri potong kertas, semua teks ASCII', () => {
    const bytes = renderEscPos(buildReceipt(data, 32), 32);
    expect(Array.from(bytes.slice(0, 2))).toEqual([0x1b, 0x40]);
    expect(Array.from(bytes.slice(-4))).toEqual([0x1d, 0x56, 0x42, 3]);
    expect(Array.from(bytes).every((b) => b < 0x80)).toBe(true);
  });
});
