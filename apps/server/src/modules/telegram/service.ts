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
import { formatMoney, LANGS, tl, type Lang, type OrderDto, type OrderStatus } from '@pos/shared';
import { dictionaries } from '@pos/shared/i18n';
import { customers, orders, payments } from '../../db/schema';
import { JOB_NAMES } from '../../lib/jobs';
import { getSettings } from '../../lib/settings';
import { privateKeyFromUrl } from '../../lib/upload';
import { answerQuestion, detectLang } from '../ai/service';
import { getOrderDto } from '../orders/dto';
import { langFromTelegram } from './initData';

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
  { received: string; payment: string; address: string; note: string; wait: string }
> = {
  id: {
    received: 'Pesanan diterima sistem',
    payment: 'Pembayaran',
    address: 'Alamat',
    note: 'Catatan',
    wait: 'Kami kabari lagi saat pesanan dikonfirmasi 🙏',
  },
  en: {
    received: 'Order received',
    payment: 'Payment',
    address: 'Address',
    note: 'Note',
    wait: "We'll update you when the order is confirmed 🙏",
  },
  kh: {
    received: 'បានទទួលការកុម្ម៉ង់',
    payment: 'ការទូទាត់',
    address: 'អាសយដ្ឋាន',
    note: 'កំណត់ចំណាំ',
    wait: 'យើងនឹងជូនដំណឹងពេលការកុម្ម៉ង់ត្រូវបានបញ្ជាក់ 🙏',
  },
  zh: {
    received: '订单已收到',
    payment: '付款方式',
    address: '地址',
    note: '备注',
    wait: '订单确认后我们会再通知您 🙏',
  },
};

/** Rincian order lengkap (item, opsi, harga per baris, subtotal, diskon, ongkir, total) dalam bahasa pelanggan. */
export function orderDetailMessage(args: { lang: Lang; restaurant: string; order: OrderDto }): string {
  const { lang, order: o } = args;
  const d = dictionaries[lang] ?? dictionaries.id;
  const T = ORDER_TEXT[lang];
  const m = (v: number) => formatMoney(v, o.currency);
  const lines: string[] = [
    `🧾 ${args.restaurant} · ${o.displayNo}`,
    `${T.received} — ${d.status[o.status]}`,
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
  sendMessage(chatId: string | number, text: string): Promise<void>;
  sendPhotoToAdmin(file: InputFile, caption: string): Promise<void>;
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

function miniAppUrl(app: FastifyInstance) {
  return `${app.config.ORDER_ORIGIN.replace(/\/$/, '')}/tg`;
}

async function customerLang(app: FastifyInstance, telegramId: string, fallback?: string): Promise<Lang> {
  const [c] = await app.db
    .select({ lang: customers.lang })
    .from(customers)
    .where(eq(customers.telegramId, telegramId));
  if (c && (LANGS as readonly string[]).includes(c.lang)) return c.lang as Lang;
  return langFromTelegram(fallback) ?? 'id';
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
      async sendToAdmin(text) {
        app.log.debug({ text }, 'telegram disabled: sendToAdmin diabaikan');
      },
    };
  }

  const bot = new Bot(token);
  const limiter = new HourlyRateLimiter(20);
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

  const sendToAdmin = async (text: string) => {
    if (!adminChat) return;
    await bot.api.sendMessage(adminChat, text.slice(0, 4000));
  };

  const langOf = async (ctx: Context) =>
    ctx.from ? customerLang(app, String(ctx.from.id), ctx.from.language_code) : ('id' as Lang);

  const mainKeyboard = (lang: Lang) =>
    new Keyboard().text(BOT_TEXT[lang].howTo).text(BOT_TEXT[lang].status).resized().persistent();

  bot.command('start', async (ctx) => {
    const lang = await langOf(ctx);
    const settings = await getSettings(app.db);
    const t = BOT_TEXT[lang];
    await ctx.reply(t.welcome.replace('{name}', settings.profile.name), {
      reply_markup: new InlineKeyboard().webApp(t.order, miniAppUrl(app)),
    });
    await ctx.reply(t.howTo + ' / ' + t.status, { reply_markup: mainKeyboard(lang) });
  });

  const howToLabels = LANGS.map((l) => BOT_TEXT[l].howTo);
  const statusLabels = LANGS.map((l) => BOT_TEXT[l].status);

  bot.hears(howToLabels, async (ctx) => {
    const lang = await langOf(ctx);
    await ctx.reply(BOT_TEXT[lang].howToBody, {
      reply_markup: new InlineKeyboard().webApp(BOT_TEXT[lang].order, miniAppUrl(app)),
    });
  });

  bot.hears(statusLabels, async (ctx) => {
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

  bot.on('message:text', async (ctx) => {
    const stored = await langOf(ctx);
    // Bahasa pesan ini (aksara/kata) — balas dengan bahasa yang sama, mis. Khmer → Khmer.
    const lang = detectLang(ctx.message.text) ?? stored;
    const key = String(ctx.from.id);
    if (!limiter.take(key)) return void (await ctx.reply(BOT_TEXT[lang].rateLimited));
    await ctx.replyWithChatAction('typing').catch(() => undefined);
    const answer = await answerQuestion(app, ctx.message.text, lang);
    // Ingat bahasa pelanggan → notifikasi order ikut bahasa ini.
    if (answer.lang !== stored)
      await app.db
        .update(customers)
        .set({ lang: answer.lang })
        .where(eq(customers.telegramId, key))
        .catch(() => undefined);
    await ctx.reply(answer.text, {
      reply_markup: new InlineKeyboard().webApp(BOT_TEXT[answer.lang].order, miniAppUrl(app)),
    });
    if (answer.forward) {
      const who = [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(' ');
      await app.jobs
        .enqueue(JOB_NAMES.telegramAdmin, {
          kind: 'question',
          text: `❓ ${who}${ctx.from.username ? ` (@${ctx.from.username})` : ''} [${ctx.from.id}] (${answer.reason}):\n${ctx.message.text}`,
        })
        .catch(() => sendToAdmin(`❓ ${who}: ${ctx.message.text}`));
    }
  });

  bot.catch((err) => app.log.error({ err: err.error }, 'grammY error'));

  return {
    enabled: true,
    async handleUpdate(update) {
      await init();
      await bot.handleUpdate(update as never);
    },
    async sendMessage(chatId, text) {
      await bot.api.sendMessage(chatId, text);
    },
    async sendPhotoToAdmin(file, caption) {
      if (!adminChat) return;
      await bot.api.sendPhoto(adminChat, file, { caption: caption.slice(0, 1000) });
    },
    sendToAdmin,
  };
}

// ---------- Job worker ----------
export async function handleNotifyJob(app: FastifyInstance, data: { orderId: string; status: OrderStatus }) {
  const tg = getTelegram(app);
  if (!tg.enabled) return;
  const o = await getOrderDto(app.db, data.orderId);
  if (!o.customer?.telegramId) return;
  const [c] = await app.db
    .select({ lang: customers.lang })
    .from(customers)
    .where(eq(customers.id, o.customer.id));
  const lang = (LANGS as readonly string[]).includes(c?.lang ?? '') ? (c!.lang as Lang) : 'id';
  const settings = await getSettings(app.db);
  if (data.status === 'pending_accept' || (data.status === 'accepted' && o.createdByStaff)) {
    await tg.sendMessage(
      o.customer.telegramId,
      orderDetailMessage({ lang, restaurant: settings.profile.name, order: o }),
    );
    return;
  }
  await tg.sendMessage(
    o.customer.telegramId,
    orderStatusMessage({
      lang,
      restaurant: settings.profile.name,
      displayNo: o.displayNo,
      status: data.status,
      total: formatMoney(o.total, o.currency),
      reason:
        data.status === 'rejected' ? o.rejectReason : data.status === 'cancelled' ? o.cancelReason : null,
    }),
  );
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
