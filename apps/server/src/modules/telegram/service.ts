/**
 * Bot Telegram (grammY) — webhook /tg/webhook. Semua fungsi no-op bila TELEGRAM_BOT_TOKEN kosong.
 * - /start & tombol menu → Mini App ORDER_ORIGIN/tg
 * - "Cara pesan", "Status pesanan"
 * - teks bebas → AI (konteks menu), rate limit 20/jam/pelanggan, cadangan + terusan ke grup admin
 * - job pg-boss: notifikasi status order (bahasa pelanggan), kirim bukti bayar ke grup admin
 */
import { and, desc, eq, gt } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { Bot, InlineKeyboard, InputFile, Keyboard, type Context } from 'grammy';
import {
  businessDate,
  formatMoney,
  formatPeriods,
  isOpenAt,
  LANGS,
  nextOpenTime,
  tl,
  type Lang,
  type OrderDto,
  type OrderStatus,
  type Settings,
} from '@pos/shared';
import { dictionaries } from '@pos/shared/i18n';
import { customers, orders, payments } from '../../db/schema';
import { now } from '../../lib/clock';
import { JOB_NAMES } from '../../lib/jobs';
import { getSettings } from '../../lib/settings';
import { privateKeyFromUrl } from '../../lib/upload';
import { answerQuestion, detectLang, isLocationQuestion } from '../ai/service';
import { activeDeliveryFor, recordIncoming } from '../chat/service';
import { getOrderDto } from '../orders/dto';
import { langFromTelegram } from './initData';
import { createOrderLinkToken } from './orderLink';

// ---------- Teks bot ----------
export const BOT_TEXT: Record<
  Lang,
  {
    welcome: string;
    order: string;
    howTo: string;
    status: string;
    howToBody: string;
    noOrders: string;
    rateLimited: string;
    closed: string;
    closedHoliday: string;
    browse: string;
  }
> = {
  id: {
    welcome: 'Halo! Selamat datang di {name} 👋\nTekan tombol di bawah untuk melihat menu dan pesan.',
    order: '🍽 Pesan sekarang',
    howTo: 'Cara pesan',
    status: 'Status pesanan',
    howToBody:
      '1. Tekan tombol "Pesan sekarang" / menu.\n2. Pilih menu & opsi, lalu masukkan ke keranjang.\n3. Pilih alamat pengantaran.\n4. Bayar cash saat diantar atau transfer ABA (upload bukti).\n5. Status pesanan dikirim otomatis ke chat ini.',
    noOrders: 'Belum ada pesanan aktif.',
    rateLimited: 'Terlalu banyak pertanyaan. Coba lagi nanti ya 🙏',
    closed:
      'Maaf kak, {name} sedang tutup 🙏\nKami buka lagi jam {next}.\n🕒 Jam buka: {hours}\n\nSementara itu, silakan lihat-lihat menu kami dulu 👇',
    closedHoliday:
      'Maaf kak, hari ini {name} libur 🙏\n🕒 Jam buka biasa: {hours}\n\nSilakan lihat-lihat menu kami dulu 👇',
    browse: '👀 Lihat menu',
  },
  en: {
    welcome: 'Hello! Welcome to {name} 👋\nTap the button below to see the menu and order.',
    order: '🍽 Order now',
    howTo: 'How to order',
    status: 'Order status',
    howToBody:
      '1. Tap "Order now" / the menu button.\n2. Choose dishes & options, add to cart.\n3. Choose your delivery address.\n4. Pay cash on delivery or by ABA transfer (upload the receipt).\n5. Order updates are sent to this chat automatically.',
    noOrders: 'You have no active orders.',
    rateLimited: 'Too many questions. Please try again later 🙏',
    closed:
      'Sorry, {name} is closed right now 🙏\nWe open again at {next}.\n🕒 Opening hours: {hours}\n\nMeanwhile, feel free to browse our menu 👇',
    closedHoliday:
      'Sorry, {name} is closed today 🙏\n🕒 Usual opening hours: {hours}\n\nFeel free to browse our menu 👇',
    browse: '👀 Browse menu',
  },
  kh: {
    welcome: 'សួស្តី! សូមស្វាគមន៍មកកាន់ {name} 👋\nចុចប៊ូតុងខាងក្រោមដើម្បីមើលម៉ឺនុយ និងកុម្ម៉ង់។',
    order: '🍽 កុម្ម៉ង់ឥឡូវ',
    howTo: 'របៀបកុម្ម៉ង់',
    status: 'ស្ថានភាពការកុម្ម៉ង់',
    howToBody:
      '1. ចុច "កុម្ម៉ង់ឥឡូវ"។\n2. ជ្រើសម្ហូប និងជម្រើស ដាក់ក្នុងកន្ត្រក។\n3. ជ្រើសអាសយដ្ឋានដឹកជញ្ជូន។\n4. បង់ប្រាក់សុទ្ធពេលដឹក ឬផ្ទេរ ABA (បញ្ចូលវិក្កយបត្រ)។\n5. ស្ថានភាពនឹងផ្ញើមកកាន់ឆាតនេះដោយស្វ័យប្រវត្តិ។',
    noOrders: 'មិនទាន់មានការកុម្ម៉ង់ទេ។',
    rateLimited: 'សំណួរច្រើនពេក។ សូមព្យាយាមម្តងទៀតពេលក្រោយ 🙏',
    closed: 'សូមអភ័យទោស {name} កំពុងបិទ 🙏\nយើងនឹងបើកវិញម៉ោង {next}។\n🕒 ម៉ោងបើក៖ {hours}\n\nសូមមើលម៉ឺនុយរបស់យើងសិន 👇',
    closedHoliday: 'សូមអភ័យទោស ថ្ងៃនេះ {name} ឈប់សម្រាក 🙏\n🕒 ម៉ោងបើកធម្មតា៖ {hours}\n\nសូមមើលម៉ឺនុយរបស់យើងសិន 👇',
    browse: '👀 មើលម៉ឺនុយ',
  },
  zh: {
    welcome: '您好！欢迎光临 {name} 👋\n点击下方按钮查看菜单并下单。',
    order: '🍽 立即点餐',
    howTo: '如何点餐',
    status: '订单状态',
    howToBody:
      '1. 点击“立即点餐”/菜单按钮。\n2. 选择菜品和选项，加入购物车。\n3. 选择送餐地址。\n4. 货到付现金或ABA转账（上传凭证）。\n5. 订单状态会自动发送到此聊天。',
    noOrders: '暂无进行中的订单。',
    rateLimited: '提问次数过多，请稍后再试 🙏',
    closed:
      '抱歉，{name} 现在已打烊 🙏\n我们将于 {next} 重新营业。\n🕒 营业时间：{hours}\n\n您可以先看看我们的菜单 👇',
    closedHoliday: '抱歉，{name} 今天休息 🙏\n🕒 平时营业时间：{hours}\n\n您可以先看看我们的菜单 👇',
    browse: '👀 看看菜单',
  },
};

const STATUS_EMOJI: Partial<Record<OrderStatus, string>> = {
  pending_accept: '🕒',
  accepted: '✅',
  cooking: '👨‍🍳',
  ready: '📦',
  picked_up: '🛵',
  delivered: '🏠',
  done: '🙏',
  rejected: '❌',
  cancelled: '❌',
};

/** Pesan notifikasi status order dalam bahasa pelanggan. */
export function orderStatusMessage(args: {
  lang: Lang;
  restaurant: string;
  displayNo: string;
  status: OrderStatus;
  total: string;
  reason?: string | null;
}): string {
  const d = dictionaries[args.lang] ?? dictionaries.id;
  const label = d.status[args.status];
  const head = `${STATUS_EMOJI[args.status] ?? 'ℹ️'} ${args.restaurant} · ${args.displayNo}`;
  const lines = [head, `${label}`];
  if (args.status === 'pending_accept') lines.push(`${d.common.total ?? 'Total'}: ${args.total}`);
  if (args.reason && (args.status === 'rejected' || args.status === 'cancelled')) lines.push(args.reason);
  return lines.join('\n');
}

const ORDER_TEXT: Record<
  Lang,
  {
    received: string;
    payment: string;
    address: string;
    note: string;
    wait: string;
    edited: string;
    thanks: string;
    joinGroup: string;
  }
> = {
  id: {
    received: 'Pesanan diterima sistem',
    payment: 'Pembayaran',
    address: 'Alamat',
    note: 'Catatan',
    wait: 'Kami kabari lagi saat pesanan dikonfirmasi 🙏',
    edited: 'Pesanan Anda diperbarui. Rincian terbaru:',
    thanks: 'Pesanan selesai. Terima kasih sudah memesan, semoga makanannya enak! 😊',
    joinGroup: '👥 Gabung grup Telegram kami',
  },
  en: {
    received: 'Order received',
    payment: 'Payment',
    address: 'Address',
    note: 'Note',
    wait: "We'll update you when the order is confirmed 🙏",
    edited: 'Your order was updated. Latest details:',
    thanks: 'Order completed. Thank you for ordering, we hope you enjoy your meal! 😊',
    joinGroup: '👥 Join our Telegram group',
  },
  kh: {
    received: 'បានទទួលការកុម្ម៉ង់',
    payment: 'ការទូទាត់',
    address: 'អាសយដ្ឋាន',
    note: 'កំណត់ចំណាំ',
    wait: 'យើងនឹងជូនដំណឹងពេលការកុម្ម៉ង់ត្រូវបានបញ្ជាក់ 🙏',
    edited: 'ការកុម្ម៉ង់របស់អ្នកត្រូវបានកែប្រែ។ ព័ត៌មានថ្មី៖',
    thanks: 'ការកុម្ម៉ង់បានបញ្ចប់។ អរគុណដែលបានកុម្ម៉ង់ សូមរីករាយជាមួយអាហារ! 😊',
    joinGroup: '👥 ចូលរួមក្រុម Telegram របស់យើង',
  },
  zh: {
    received: '订单已收到',
    payment: '付款方式',
    address: '地址',
    note: '备注',
    wait: '订单确认后我们会再通知您 🙏',
    edited: '您的订单已更新，最新明细：',
    thanks: '订单已完成。感谢您的订购，祝您用餐愉快！😊',
    joinGroup: '👥 加入我们的 Telegram 群',
  },
};

/** Rincian order lengkap (item, opsi, harga per baris, subtotal, diskon, ongkir, total) dalam bahasa pelanggan. */
export function orderDetailMessage(args: {
  lang: Lang;
  restaurant: string;
  order: OrderDto;
  /** Order diedit kasir → judul "Pesanan diperbarui". */
  edited?: boolean;
}): string {
  const { lang, order: o } = args;
  const d = dictionaries[lang] ?? dictionaries.id;
  const T = ORDER_TEXT[lang];
  const m = (v: number) => formatMoney(v, o.currency);
  const lines: string[] = [
    `${args.edited ? '✏️' : '🧾'} ${args.restaurant} · ${o.displayNo}`,
    args.edited ? T.edited : `${T.received} — ${d.status[o.status]}`,
    '',
  ];
  for (const it of o.items) {
    lines.push(`${it.qty}× ${tl(it.name, lang)}  ${m(it.lineTotal)}`);
    for (const op of it.options)
      lines.push(`   + ${tl(op.optionName, lang)}${op.priceDelta ? ` (${m(op.priceDelta)})` : ''}`);
    if (it.note) lines.push(`   📝 ${it.note}`);
  }
  lines.push('—'.repeat(14));
  lines.push(`${d.common.subtotal}: ${m(o.subtotal)}`);
  if (o.discount) lines.push(`${d.common.discount}: −${m(o.discount)}`);
  if (o.type === 'delivery') lines.push(`${d.common.deliveryFee}: ${m(o.deliveryFee)}`);
  lines.push(`${d.common.total.toUpperCase()}: ${m(o.total)}`);
  if (o.paymentMethod) lines.push(`${T.payment}: ${d.paymentMethod[o.paymentMethod] ?? o.paymentMethod}`);
  if (o.address)
    lines.push(`${T.address}: ${o.address.text}${o.address.landmark ? ` (${o.address.landmark})` : ''}`);
  if (o.note) lines.push(`${T.note}: ${o.note}`);
  if (o.status === 'pending_accept') lines.push('', T.wait);
  return lines.join('\n');
}

// ---------- Rate limit (in-memory, satu proses) ----------
export class HourlyRateLimiter {
  private hits = new Map<string, number[]>();
  constructor(
    private readonly max = 20,
    private readonly windowMs = 3600_000,
  ) {}
  /** true = boleh. */
  take(key: string, at = Date.now()): boolean {
    const list = (this.hits.get(key) ?? []).filter((t) => at - t < this.windowMs);
    if (list.length >= this.max) {
      this.hits.set(key, list);
      return false;
    }
    list.push(at);
    this.hits.set(key, list);
    return true;
  }
}

// ---------- Bot ----------
export interface TelegramService {
  enabled: boolean;
  handleUpdate(update: unknown): Promise<void>;
  /** `businessConnectionId`: kirim lewat akun Telegram Business (chat pribadi pemilik). */
  sendMessage(
    chatId: string | number,
    text: string,
    businessConnectionId?: string | null,
    button?: { text: string; url: string } | null,
  ): Promise<void>;
  sendPhotoToAdmin(file: InputFile, caption: string): Promise<void>;
  /** Kirim foto ke pelanggan (chat driver). */
  sendPhoto(
    chatId: string | number,
    file: Buffer,
    caption: string,
    businessConnectionId?: string | null,
  ): Promise<void>;
  /** Unduh file kiriman pelanggan (foto chat) dari server Telegram. */
  downloadFile(fileId: string): Promise<Buffer | null>;
  sendToAdmin(text: string): Promise<void>;
}

const services = new WeakMap<FastifyInstance, TelegramService>();

export function getTelegram(app: FastifyInstance): TelegramService {
  let s = services.get(app);
  if (!s) {
    s = createTelegram(app);
    services.set(app, s);
  }
  return s;
}

/** Hanya untuk tes: pasang TelegramService palsu. */
export function setTelegramForTest(app: FastifyInstance, svc: TelegramService) {
  services.set(app, svc);
}

/** URL Mini App; `lang` membuat menu langsung tampil dalam bahasa chat pelanggan. */
export function miniAppUrl(app: FastifyInstance, lang?: Lang) {
  const base = `${app.config.ORDER_ORIGIN.replace(/\/$/, '')}/tg`;
  return lang ? `${base}?lang=${lang}` : base;
}

async function customerLang(app: FastifyInstance, telegramId: string, fallback?: string): Promise<Lang> {
  const [c] = await app.db
    .select({ lang: customers.lang })
    .from(customers)
    .where(eq(customers.telegramId, telegramId));
  if (c && (LANGS as readonly string[]).includes(c.lang)) return c.lang as Lang;
  return langFromTelegram(fallback) ?? 'id';
}

/** Tombol "Pesan sekarang": Mini App di chat bot. Di chat Telegram Business tombol web_app tidak
 * diizinkan → URL biasa langsung ke web order (bahasa chat + token sesi pelanggan Telegram). */
function orderButton(app: FastifyInstance, lang: Lang, businessFor?: number, label = BOT_TEXT[lang].order) {
  const kb = new InlineKeyboard();
  if (businessFor == null) return kb.webApp(label, miniAppUrl(app, lang));
  return kb.url(label, businessOrderUrl(app, String(businessFor), lang));
}

/** URL web order untuk pelanggan chat bisnis (berlaku 7 hari). */
export function businessOrderUrl(app: FastifyInstance, telegramId: string, lang: Lang) {
  const t = createOrderLinkToken(app.config.SESSION_SECRET, telegramId, Math.floor(Date.now() / 1000));
  return `${miniAppUrl(app, lang)}&t=${t}`;
}

/**
 * Di luar jam buka: kabari tutup + jam buka berikutnya (tanpa jawaban AI / menu), dengan tombol
 * "Lihat menu" untuk melihat-lihat. null bila sedang buka.
 */
export function closedReply(settings: Settings, lang: Lang, at: Date = new Date()): string | null {
  if (isOpenAt(at, settings.hours)) return null;
  const t = BOT_TEXT[lang];
  const hours = formatPeriods(settings.hours);
  const holiday = settings.hours.holidays?.includes(businessDate(at, settings.hours)) ?? false;
  return (holiday ? t.closedHoliday : t.closed)
    .replace('{name}', settings.profile.name)
    .replace('{next}', nextOpenTime(at, settings.hours) ?? settings.hours.open)
    .replace('{hours}', hours);
}

/** Pelanggan dari chat Telegram Business → simpan/perbarui (bisa dicari kasir, notifikasi lewat akun bisnis). */
async function upsertBusinessCustomer(
  app: FastifyInstance,
  from: { id: number; first_name: string; last_name?: string; username?: string },
  businessConnectionId: string,
  lang: Lang,
) {
  const name = [from.first_name, from.last_name].filter(Boolean).join(' ') || null;
  await app.db
    .insert(customers)
    .values({
      telegramId: String(from.id),
      name,
      username: from.username ?? null,
      lang,
      tgBusinessConnectionId: businessConnectionId,
    })
    .onConflictDoUpdate({
      target: customers.telegramId,
      set: {
        tgBusinessConnectionId: businessConnectionId,
        ...(from.username ? { username: from.username } : {}),
      },
    });
}

/** Unduh file dari Telegram (maks 20 MB lewat Bot API). */
export async function downloadTelegramFile(bot: Bot, token: string, fileId: string): Promise<Buffer | null> {
  const f = await bot.api.getFile(fileId);
  if (!f.file_path) return null;
  const res = await fetch(`https://api.telegram.org/file/bot${token}/${f.file_path}`);
  if (!res.ok) return null;
  return Buffer.from(await res.arrayBuffer());
}

/** Daftarkan semua handler bot (dipisah agar bisa diuji tanpa jaringan). */
export function setupBot(app: FastifyInstance, bot: Bot, sendToAdmin: (text: string) => Promise<void>) {
  const limiter = new HourlyRateLimiter(20);
  /** business_connection_id → id user pemilik akun bisnis (pesan dari pemilik tidak dijawab bot). */
  const owners = new Map<string, number>();
  const ownerOf = async (connId: string): Promise<number | null> => {
    const cached = owners.get(connId);
    if (cached) return cached;
    try {
      const c = await bot.api.getBusinessConnection(connId);
      owners.set(connId, c.user.id);
      return c.user.id;
    } catch (err) {
      app.log.warn({ err: (err as Error).message }, 'getBusinessConnection gagal');
      return null;
    }
  };

  const langOf = async (ctx: Context) =>
    ctx.from ? customerLang(app, String(ctx.from.id), ctx.from.language_code) : ('id' as Lang);

  const mainKeyboard = (lang: Lang) =>
    new Keyboard().text(BOT_TEXT[lang].howTo).text(BOT_TEXT[lang].status).resized().persistent();

  // Telegram Business: akun pribadi/premium menghubungkan bot ini → chat pelanggan dijawab bot.
  bot.on('business_connection', async (ctx) => {
    const c = ctx.update.business_connection!;
    owners.set(c.id, c.user.id);
    const canReply = !!c.rights?.can_reply;
    app.log.info(
      { id: c.id, user: c.user.id, enabled: c.is_enabled, canReply },
      'Telegram Business connection',
    );
    await sendToAdmin(
      !c.is_enabled
        ? `🔌 Bot dilepas dari akun Telegram Business ${c.user.first_name}.`
        : canReply
          ? `✅ Bot terhubung ke akun Telegram Business ${c.user.first_name}. Chat pelanggan akan dijawab otomatis.`
          : `⚠️ Bot terhubung ke akun ${c.user.first_name}, tapi izin "Balas pesan" belum aktif. Buka Telegram → Settings → Telegram Business → Chatbots → aktifkan "Reply to messages".`,
    ).catch(() => undefined);
  });

  bot.command('start', async (ctx) => {
    // Payload "order_kh" dari tombol di chat bisnis → bahasa menu ikut bahasa chat.
    const payload = /^order_(id|en|kh|zh)$/.exec(ctx.match ?? '')?.[1] as Lang | undefined;
    const lang = payload ?? (await langOf(ctx));
    if (payload && ctx.from)
      await app.db
        .update(customers)
        .set({ lang: payload })
        .where(eq(customers.telegramId, String(ctx.from.id)))
        .catch(() => undefined);
    const settings = await getSettings(app.db);
    const t = BOT_TEXT[lang];
    const closed = closedReply(settings, lang, now());
    await ctx.reply(closed ?? t.welcome.replace('{name}', settings.profile.name), {
      reply_markup: new InlineKeyboard().webApp(closed ? t.browse : t.order, miniAppUrl(app, lang)),
    });
    await ctx.reply(t.howTo + ' / ' + t.status, { reply_markup: mainKeyboard(lang) });
  });

  const howToLabels = LANGS.map((l) => BOT_TEXT[l].howTo);
  const statusLabels = LANGS.map((l) => BOT_TEXT[l].status);

  bot.on('message:text').hears(howToLabels, async (ctx) => {
    const lang = await langOf(ctx);
    await ctx.reply(BOT_TEXT[lang].howToBody, { reply_markup: orderButton(app, lang) });
  });

  bot.on('message:text').hears(statusLabels, async (ctx) => {
    const lang = await langOf(ctx);
    const settings = await getSettings(app.db);
    const [c] = ctx.from
      ? await app.db
          .select()
          .from(customers)
          .where(eq(customers.telegramId, String(ctx.from.id)))
      : [];
    const since = new Date(Date.now() - 2 * 86400_000);
    const list = c
      ? await app.db
          .select()
          .from(orders)
          .where(and(eq(orders.customerId, c.id), gt(orders.createdAt, since)))
          .orderBy(desc(orders.createdAt))
          .limit(5)
      : [];
    if (!list.length) return void (await ctx.reply(BOT_TEXT[lang].noOrders));
    const d = dictionaries[lang];
    const text = list
      .map(
        (o) =>
          `${STATUS_EMOJI[o.status] ?? ''} ${o.displayNo} · ${d.status[o.status]} · ${formatMoney(o.total, settings.currency.main)}`,
      )
      .join('\n');
    await ctx.reply(text);
  });

  /** Pesan pemilik akun bisnis (balasan manual) / bot → abaikan. */
  const ignoreBusiness = async (ctx: Context) => {
    const m = ctx.businessMessage;
    if (!m) return false;
    if (!m.from || m.from.is_bot || !m.business_connection_id) return true;
    return m.from.id === (await ownerOf(m.business_connection_id));
  };

  /**
   * Pelanggan yang order delivery-nya sedang diantar → pesan (teks/foto/lokasi) diteruskan ke
   * aplikasi driver, tidak dijawab AI. Mengembalikan true bila diteruskan.
   */
  const relayToDriver = async (
    ctx: Context,
    msg: { kind: 'text' | 'photo' | 'location'; text?: string; fileId?: string; lat?: number; lng?: number },
  ): Promise<boolean> => {
    if (!ctx.from) return false;
    const orderId = await activeDeliveryFor(app, String(ctx.from.id)).catch(() => null);
    if (!orderId) return false;
    let photoUrl: string | null = null;
    if (msg.fileId) {
      const data = await downloadTelegramFile(bot, bot.token, msg.fileId).catch(() => null);
      if (data)
        photoUrl = (
          await app.storage.save({ data, mimetype: 'image/jpeg', visibility: 'private', folder: 'chat' })
        ).url;
    }
    await recordIncoming(app, orderId, { ...msg, photoUrl });
    return true;
  };

  /** Pertanyaan bebas (chat bot langsung atau chat Telegram Business) → AI. */
  const answerText = async (ctx: Context, text: string, business: boolean) => {
    const from = ctx.from!;
    if (await relayToDriver(ctx, { kind: 'text', text })) return;
    const stored = await langOf(ctx);
    // Bahasa pesan ini (aksara/kata) — balas dengan bahasa yang sama, mis. Khmer → Khmer.
    const lang = detectLang(text) ?? stored;
    const key = String(from.id);
    if (!limiter.take(key)) return void (await ctx.reply(BOT_TEXT[lang].rateLimited));
    // Tutup → beri tahu jam buka, bukan menu; tetap boleh melihat-lihat menu.
    const closed = closedReply(await getSettings(app.db), lang, now());
    if (closed) {
      return void (await ctx.reply(closed, {
        reply_markup: orderButton(app, lang, business ? from.id : undefined, BOT_TEXT[lang].browse),
      }));
    }
    await ctx.replyWithChatAction('typing').catch(() => undefined);
    const answer = await answerQuestion(app, text, lang);
    // Ingat bahasa pelanggan → notifikasi order ikut bahasa ini.
    if (answer.lang !== stored)
      await app.db
        .update(customers)
        .set({ lang: answer.lang })
        .where(eq(customers.telegramId, key))
        .catch(() => undefined);
    await ctx.reply(answer.text, {
      reply_markup: orderButton(app, answer.lang, business ? from.id : undefined),
    });
    // Pertanyaan lokasi → kirim juga pin lokasi restoran (bisa dibuka di Google Maps).
    if (isLocationQuestion(text)) {
      const s = await getSettings(app.db);
      if (s.profile.lat != null && s.profile.lng != null)
        await ctx
          .replyWithVenue(s.profile.lat, s.profile.lng, s.profile.name, s.profile.address || s.profile.name)
          .catch(() => undefined);
    }
    if (answer.forward) {
      const who = [from.first_name, from.last_name].filter(Boolean).join(' ');
      await app.jobs
        .enqueue(JOB_NAMES.telegramAdmin, {
          kind: 'question',
          text: `❓ ${who}${from.username ? ` (@${from.username})` : ''} [${from.id}]${business ? ' · Business' : ''} (${answer.reason}${answer.error ? `: ${answer.error.slice(0, 160)}` : ''}):\n${text}`,
        })
        .catch(() => sendToAdmin(`❓ ${who}: ${text}`));
    }
  };

  bot.on('message:text', (ctx) => answerText(ctx, ctx.message.text, false));

  // Foto & lokasi dari pelanggan yang sedang diantar → ke aplikasi driver.
  bot.on(['message:photo', 'business_message:photo'], async (ctx) => {
    if (await ignoreBusiness(ctx)) return;
    const photo = ctx.msg.photo.at(-1);
    if (photo) await relayToDriver(ctx, { kind: 'photo', fileId: photo.file_id, text: ctx.msg.caption });
  });
  bot.on(['message:location', 'business_message:location'], async (ctx) => {
    if (await ignoreBusiness(ctx)) return;
    const l = ctx.msg.location;
    await relayToDriver(ctx, { kind: 'location', lat: l.latitude, lng: l.longitude });
  });

  bot.on('business_message:text', async (ctx) => {
    const msg = ctx.businessMessage;
    const from = msg.from;
    // Pesan yang dikirim pemilik akun (balasan manual staf) → jangan dijawab bot.
    if (!from || !msg.business_connection_id || (await ignoreBusiness(ctx))) return;
    const lang = detectLang(msg.text) ?? (await langOf(ctx));
    await upsertBusinessCustomer(app, from, msg.business_connection_id, lang).catch((err) =>
      app.log.warn({ err: (err as Error).message }, 'simpan pelanggan business gagal'),
    );
    await answerText(ctx, msg.text, true);
  });

  bot.catch((err) => app.log.error({ err: err.error }, 'grammY error'));
}

function createTelegram(app: FastifyInstance): TelegramService {
  const token = app.config.TELEGRAM_BOT_TOKEN;
  const adminChat = app.config.TELEGRAM_ADMIN_CHAT_ID;
  if (!token) {
    return {
      enabled: false,
      async handleUpdate() {},
      async sendMessage(chatId, text) {
        app.log.debug({ chatId, text }, 'telegram disabled: sendMessage diabaikan');
      },
      async sendPhotoToAdmin() {},
      async sendPhoto(chatId, _file, caption) {
        app.log.debug({ chatId, caption }, 'telegram disabled: sendPhoto diabaikan');
      },
      async downloadFile() {
        return null;
      },
      async sendToAdmin(text) {
        app.log.debug({ text }, 'telegram disabled: sendToAdmin diabaikan');
      },
    };
  }

  const bot = new Bot(token);
  const sendToAdmin = async (text: string) => {
    if (!adminChat) return;
    await bot.api.sendMessage(adminChat, text.slice(0, 4000));
  };
  setupBot(app, bot, sendToAdmin);
  let initPromise: Promise<void> | null = null;
  const init = () =>
    (initPromise ??= (async () => {
      await bot.init();
      try {
        await bot.api.setChatMenuButton({
          menu_button: { type: 'web_app', text: 'Menu', web_app: { url: miniAppUrl(app) } },
        });
      } catch (err) {
        app.log.warn({ err: (err as Error).message }, 'setChatMenuButton gagal');
      }
    })().catch((err) => {
      initPromise = null;
      throw err;
    }));

  return {
    enabled: true,
    async handleUpdate(update) {
      await init();
      await bot.handleUpdate(update as never);
    },
    async sendMessage(chatId, text, businessConnectionId, button) {
      const extra = button ? { reply_markup: new InlineKeyboard().url(button.text, button.url) } : {};
      if (businessConnectionId) {
        try {
          await bot.api.sendMessage(chatId, text, { ...extra, business_connection_id: businessConnectionId });
          return;
        } catch (err) {
          app.log.warn({ err: (err as Error).message }, 'kirim via Telegram Business gagal, coba langsung');
        }
      }
      await bot.api.sendMessage(chatId, text, extra);
    },
    async sendPhoto(chatId, file, caption, businessConnectionId) {
      const opts = { caption: caption.slice(0, 1000) };
      if (businessConnectionId) {
        try {
          await bot.api.sendPhoto(chatId, new InputFile(file), {
            ...opts,
            business_connection_id: businessConnectionId,
          });
          return;
        } catch (err) {
          app.log.warn(
            { err: (err as Error).message },
            'kirim foto via Telegram Business gagal, coba langsung',
          );
        }
      }
      await bot.api.sendPhoto(chatId, new InputFile(file), opts);
    },
    async downloadFile(fileId) {
      return downloadTelegramFile(bot, token, fileId);
    },
    async sendPhotoToAdmin(file, caption) {
      if (!adminChat) return;
      await bot.api.sendPhoto(adminChat, file, { caption: caption.slice(0, 1000) });
    },
    sendToAdmin,
  };
}

// ---------- Job worker ----------
/** Status yang TIDAK dikirim ke pelanggan (alur notifikasi: diterima → siap → diantar → sampai → selesai). */
const SILENT_STATUSES: readonly OrderStatus[] = ['cooking', 'served'];

export async function handleNotifyJob(
  app: FastifyInstance,
  data: { orderId: string; status: OrderStatus; kind?: 'edited' },
) {
  const tg = getTelegram(app);
  if (!tg.enabled) return;
  const o = await getOrderDto(app.db, data.orderId);
  if (!o.customer?.telegramId) return;
  const chatId = o.customer.telegramId;
  const [c] = await app.db
    .select({ lang: customers.lang, biz: customers.tgBusinessConnectionId })
    .from(customers)
    .where(eq(customers.id, o.customer.id));
  const biz = c?.biz ?? null;
  const lang = (LANGS as readonly string[]).includes(c?.lang ?? '') ? (c!.lang as Lang) : 'id';
  const settings = await getSettings(app.db);
  const restaurant = settings.profile.name;
  // Order diedit kasir → rincian terbaru.
  if (data.kind === 'edited') {
    await tg.sendMessage(chatId, orderDetailMessage({ lang, restaurant, order: o, edited: true }), biz);
    return;
  }
  // 1. Pesanan masuk (atau dibuat kasir langsung diterima) → rincian lengkap.
  if (data.status === 'pending_accept' || (data.status === 'accepted' && o.createdByStaff)) {
    await tg.sendMessage(chatId, orderDetailMessage({ lang, restaurant, order: o }), biz);
    return;
  }
  if (SILENT_STATUSES.includes(data.status)) return;
  const statusText = orderStatusMessage({
    lang,
    restaurant,
    displayNo: o.displayNo,
    status: data.status,
    total: formatMoney(o.total, o.currency),
    reason: data.status === 'rejected' ? o.rejectReason : data.status === 'cancelled' ? o.cancelReason : null,
  });
  // 5. Sampai → kirim foto bukti dari driver bila ada.
  if (data.status === 'delivered') {
    const [row] = await app.db
      .select({ photo: orders.deliveryPhotoUrl })
      .from(orders)
      .where(eq(orders.id, o.id));
    const key = row?.photo ? privateKeyFromUrl(row.photo) : null;
    const file = key ? await app.storage.readPrivate(key) : null;
    if (file) {
      const chunks: Buffer[] = [];
      for await (const ch of file.stream) chunks.push(Buffer.from(ch as Uint8Array));
      await tg.sendPhoto(chatId, Buffer.concat(chunks), statusText, biz);
      return;
    }
  }
  // 6. Selesai → terima kasih + tombol gabung grup Telegram (Pengaturan).
  if (data.status === 'done') {
    const url = settings.telegram.groupUrl.trim();
    await tg.sendMessage(
      chatId,
      `${statusText}\n\n${ORDER_TEXT[lang].thanks}`,
      biz,
      /^https?:\/\//.test(url) ? { text: ORDER_TEXT[lang].joinGroup, url } : null,
    );
    return;
  }
  await tg.sendMessage(chatId, statusText, biz);
}

export async function handleAdminJob(
  app: FastifyInstance,
  data: { kind: 'proof'; paymentId: number; orderId: string } | { kind: 'question'; text: string },
) {
  const tg = getTelegram(app);
  if (!tg.enabled) return;
  if (data.kind === 'question') return tg.sendToAdmin(data.text);
  const [p] = await app.db.select().from(payments).where(eq(payments.id, data.paymentId));
  if (!p?.proofUrl) return;
  const o = await getOrderDto(app.db, data.orderId);
  const caption = `💳 Bukti ABA ${o.displayNo} · ${formatMoney(o.total, o.currency)}\n${o.customer?.name ?? o.customerName ?? ''}`;
  const key = privateKeyFromUrl(p.proofUrl);
  const file = key ? await app.storage.readPrivate(key) : null;
  if (!file) return tg.sendToAdmin(`${caption}\n(file bukti tidak ditemukan)`);
  await tg.sendPhotoToAdmin(new InputFile(file.stream), caption);
}
