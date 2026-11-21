import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { OrderDto } from '@pos/shared';
import { answerQuestion, detectLang, menuLookupReply } from '../src/modules/ai/service';
import { orderDetailMessage } from '../src/modules/telegram/service';
import { call, createTestApp, loginAs } from './helpers';

describe('deteksi bahasa pesan', () => {
  it('Khmer, Mandarin, Indonesia, Inggris; tidak yakin → null', () => {
    expect(detectLang('តើបាយមាន់ចៀនតម្លៃប៉ុន្មាន?')).toBe('kh');
    expect(detectLang('炸鸡多少钱？')).toBe('zh');
    expect(detectLang('kak, ayam goreng harganya berapa?')).toBe('id');
    expect(detectLang('How much is the fried chicken?')).toBe('en');
    expect(detectLang('👍')).toBeNull();
    expect(detectLang('Pempek')).toBeNull();
  });
});

const order = {
  displayNo: '#7',
  status: 'pending_accept',
  type: 'delivery',
  currency: 'KHR',
  items: [
    {
      qty: 2,
      name: { id: 'Ayam Goreng', kh: 'មាន់ចៀន' },
      lineTotal: 24000,
      note: null,
      options: [{ optionName: { id: 'Paha', kh: 'ភ្លៅ' }, priceDelta: 2000 }],
    },
    { qty: 1, name: { id: 'Es Teh', kh: 'តែទឹកកក' }, lineTotal: 2000, note: 'tanpa gula', options: [] },
  ],
  subtotal: 26000,
  discount: 1000,
  deliveryFee: 4000,
  total: 29000,
  paymentMethod: 'cash',
  address: { text: 'Street 108', landmark: 'dekat Golden Lion' },
  note: null,
} as unknown as OrderDto;

describe('rincian order ke pelanggan', () => {
  it('Khmer: nama menu, opsi, subtotal, diskon, ongkir, total', () => {
    const msg = orderDetailMessage({ lang: 'kh', restaurant: 'RM Berkat', order });
    expect(msg).toContain('RM Berkat · #7');
    expect(msg).toContain('2× មាន់ចៀន');
    expect(msg).toContain('+ ភ្លៅ');
    expect(msg).toContain('📝 tanpa gula');
    expect(msg).toMatch(/29\.000/);
    expect(msg).toMatch(/−1\.000/);
    expect(msg).toContain('Street 108 (dekat Golden Lion)');
  });
  it('Indonesia memakai label Subtotal/Ongkir/TOTAL', () => {
    const msg = orderDetailMessage({ lang: 'id', restaurant: 'RM Berkat', order });
    expect(msg).toContain('Subtotal');
    expect(msg).toContain('Ongkir');
    expect(msg).toContain('TOTAL');
    expect(msg).toContain('2× Ayam Goreng');
  });
});

describe('tanya menu tanpa Gemini (cadangan)', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await createTestApp();
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
  });

  it('menyebut nama menu → harga & opsi dalam bahasa pesan', async () => {
    const r = await menuLookupReply(app, 'ayam goreng berapa kak?', 'id');
    expect(r).toMatch(/Ayam Goreng — Harga: 10\.000/);
    const a = await answerQuestion(app, 'How much is Ayam Goreng?', 'id');
    expect(a.lang).toBe('en');
    expect(a.forward).toBe(false);
    expect(a.text).toContain('Price');
  });

  it('tidak ada menu cocok → diteruskan ke admin dengan balasan sesuai bahasa', async () => {
    const a = await answerQuestion(app, 'តើហាងបើកម៉ោងប៉ុន្មាន?', 'id');
    expect(a.forward).toBe(true);
    expect(a.lang).toBe('kh');
    expect(a.text).toContain('សូមអភ័យទោស');
  });

  it('Tes AI (admin): menunjukkan key belum diisi + alasan', async () => {
    const owner = await loginAs(app, 'Owner');
    const res = await call(app, 'adminAiTest', { cookie: owner, body: { question: 'Ayam Goreng berapa?' } });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.keySet).toBe(false);
    expect(body.reason).toBe('lookup');
    expect(body.error).toMatch(/GEMINI_API_KEY/);
    expect(body.answer).toContain('Ayam Goreng');
    const kasir = await loginAs(app, 'Kasir Pagi');
    expect((await call(app, 'adminAiTest', { cookie: kasir, body: { question: 'x' } })).statusCode).toBe(403);
  });
});
