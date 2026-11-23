import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { OrderDto, Settings } from '@pos/shared';
import {
  answerQuestion,
  buildMenuContext,
  detectLang,
  isLocationQuestion,
  menuLookupReply,
} from '../src/modules/ai/service';
import { closedReply, miniAppUrl, orderDetailMessage } from '../src/modules/telegram/service';
import { call, createTestApp, loginAs } from './helpers';

describe('deteksi bahasa pesan', () => {
  it('Khmer, Mandarin, Indonesia, Inggris; tidak yakin → null', () => {
    expect(detectLang('តើបាយមាន់ចៀនតម្លៃប៉ុន្មាន?')).toBe('kh');
    expect(detectLang('炸鸡多少钱？')).toBe('zh');
    expect(detectLang('kak, ayam goreng harganya berapa?')).toBe('id');
    expect(detectLang('How much is the fried chicken?')).toBe('en');
    expect(detectLang('👍')).toBeNull();
    expect(detectLang('Pempek')).toBeNull();
    // bahasa lain → Inggris
    expect(detectLang('ไก่ทอดราคาเท่าไหร่')).toBe('en');
    expect(detectLang('Gà rán bao nhiêu tiền?')).toBe('en');
    expect(detectLang('チキンはいくら')).toBe('en');
  });

  it('tombol Pesan sekarang membuka menu dalam bahasa chat', () => {
    const app = { config: { ORDER_ORIGIN: 'https://order.example.com/' } } as unknown as FastifyInstance;
    expect(miniAppUrl(app, 'kh')).toBe('https://order.example.com/tg?lang=kh');
    expect(miniAppUrl(app)).toBe('https://order.example.com/tg');
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

describe('bot saat restoran tutup', () => {
  const settings = {
    profile: { name: 'RM Berkat' },
    hours: {
      open: '08:00',
      close: '20:00',
      periods: [
        { open: '08:00', close: '14:00' },
        { open: '17:00', close: '20:00' },
      ],
      holidays: ['2031-05-01'],
    },
  } as unknown as Settings;

  it('di luar jam buka → kabar tutup, jam buka berikutnya & semua sesi; saat buka → null', () => {
    const t = closedReply(settings, 'id', new Date('2031-05-02T15:00:00+07:00'))!;
    expect(t).toContain('sedang tutup');
    expect(t).toContain('buka lagi jam 17:00');
    expect(t).toContain('08:00–14:00, 17:00–20:00');
    expect(t).toContain('lihat-lihat menu');
    expect(closedReply(settings, 'kh', new Date('2031-05-02T22:00:00+07:00'))).toContain('08:00');
    expect(closedReply(settings, 'id', new Date('2031-05-02T09:00:00+07:00'))).toBeNull();
  });

  it('hari libur → pesan libur', () => {
    expect(closedReply(settings, 'en', new Date('2031-05-01T10:00:00+07:00'))).toContain('closed today');
  });
});

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

  it('kata sebagian ("ada ayam?"), minta menu, dan salam dijawab tanpa diteruskan', async () => {
    const part = await answerQuestion(app, 'kak ada ayam?', 'id');
    expect(part.forward).toBe(false);
    expect(part.text).toContain('Ayam Goreng');
    const menu = await answerQuestion(app, 'boleh menu kak', 'id');
    expect(menu.forward).toBe(false);
    expect(menu.text).toContain('Menu kami');
    expect(menu.text).toMatch(/Ayam Goreng — /);
    const hi = await answerQuestion(app, 'halo kak', 'id');
    expect(hi.forward).toBe(false);
    expect(hi.text).toContain('Selamat datang');
  });

  it('tanya jam buka saat buka → jam buka dijawab, tidak diteruskan', async () => {
    const a = await answerQuestion(app, 'តើហាងបើកម៉ោងប៉ុន្មាន?', 'id');
    expect(a.forward).toBe(false);
    expect(a.lang).toBe('kh');
    expect(a.text).toContain('ម៉ោងបើក');
  });

  it('tidak ada menu cocok → diteruskan ke admin dengan balasan sesuai bahasa', async () => {
    const a = await answerQuestion(app, 'ខ្ញុំចង់ប្តឹងអំពីការដឹកជញ្ជូន', 'id');
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

  it('tanya lokasi / makan di tempat → alamat, patokan, link maps (tanpa Gemini) & masuk konteks AI', async () => {
    const owner = await loginAs(app, 'Owner');
    const upd = await call(app, 'adminSettingsUpdate', {
      cookie: owner,
      body: {
        profile: { address: 'Street 108, Sihanoukville', landmark: 'seberang Golden Lion', mapsUrl: '' },
        ai: { notes: 'Parkir motor di depan' },
      },
    });
    expect(upd.statusCode).toBe(200);
    const a = await answerQuestion(app, 'Lokasinya dimana kak? bisa makan di tempat?', 'id');
    expect(a.forward).toBe(false);
    expect(a.text).toContain('Street 108, Sihanoukville');
    expect(a.text).toContain('seberang Golden Lion');
    expect(a.text).toMatch(/maps\.google\.com\/\?q=/);
    const kh = await answerQuestion(app, 'ហាងនៅឯណា?', 'id');
    expect(kh.text).toContain('ទីតាំងរបស់យើង');
    const ctx = await buildMenuContext(app);
    expect(ctx).toContain('seberang Golden Lion');
    expect(ctx).toContain('Parkir motor di depan');
    expect(isLocationQuestion('Where are you located?')).toBe(true);
    expect(isLocationQuestion('炸鸡多少钱')).toBe(false);
  });
});
