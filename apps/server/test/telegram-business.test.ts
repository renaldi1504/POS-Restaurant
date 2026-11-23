import type { FastifyInstance } from 'fastify';
import { Bot } from 'grammy';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { customers } from '../src/db/schema';
import { setupBot } from '../src/modules/telegram/service';
import { createTestApp } from './helpers';

let app: FastifyInstance;
const calls: { method: string; payload: Record<string, unknown> }[] = [];
let bot: Bot;
const admin: string[] = [];

const OWNER = 5550001;
const CUSTOMER = 7770001;

beforeAll(async () => {
  app = await createTestApp();
  await app.ready();
  bot = new Bot('123:TEST', {
    botInfo: {
      id: 123,
      is_bot: true,
      first_name: 'Berkat Bot',
      username: 'berkat_bot',
      can_join_groups: false,
      can_read_all_group_messages: false,
      supports_inline_queries: false,
      can_connect_to_business: true,
      has_main_web_app: false,
    } as never,
  });
  bot.api.config.use(async (_prev, method, payload) => {
    calls.push({ method, payload: payload as Record<string, unknown> });
    if (method === 'getBusinessConnection')
      return {
        ok: true,
        result: {
          id: 'BC1',
          user: { id: OWNER, is_bot: false, first_name: 'Komodo' },
          user_chat_id: OWNER,
          date: 0,
          is_enabled: true,
        },
      } as never;
    return { ok: true, result: true } as never;
  });
  setupBot(app, bot, async (t) => void admin.push(t));
});
afterAll(async () => {
  await app.close();
});

const bizMsg = (fromId: number, text: string, id = 1) => ({
  update_id: id,
  business_message: {
    message_id: id,
    business_connection_id: 'BC1',
    date: 0,
    chat: { id: CUSTOMER, type: 'private', first_name: 'Sok' },
    from: {
      id: fromId,
      is_bot: false,
      first_name: fromId === OWNER ? 'Komodo' : 'Sok',
      username: fromId === OWNER ? undefined : 'sokdara',
    },
    text,
  },
});

describe('Telegram Business (akun premium terhubung ke bot)', () => {
  it('pesan pelanggan dijawab lewat koneksi bisnis, dengan tombol tautan (bukan web_app)', async () => {
    calls.length = 0;
    await bot.handleUpdate(bizMsg(CUSTOMER, 'kak, ayam goreng harganya berapa?') as never);
    const sent = calls.filter((c) => c.method === 'sendMessage');
    expect(sent.length).toBeGreaterThan(0);
    expect(sent[0]!.payload.business_connection_id).toBe('BC1');
    expect(sent[0]!.payload.chat_id).toBe(CUSTOMER);
    const kb = JSON.stringify(sent[0]!.payload.reply_markup);
    expect(kb).toContain('https://t.me/berkat_bot?start=order_id');
    expect(kb).not.toContain('web_app');
    const [c] = await app.db
      .select()
      .from(customers)
      .where(eq(customers.telegramId, String(CUSTOMER)));
    expect(c).toMatchObject({ username: 'sokdara', tgBusinessConnectionId: 'BC1' });
  });

  it('balasan manual dari pemilik akun tidak dijawab bot', async () => {
    calls.length = 0;
    await bot.handleUpdate(bizMsg(OWNER, 'Baik kak, sebentar ya', 2) as never);
    expect(calls.filter((c) => c.method === 'sendMessage')).toHaveLength(0);
  });

  it('koneksi tanpa izin balas → admin diberi tahu cara mengaktifkan', async () => {
    admin.length = 0;
    await bot.handleUpdate({
      update_id: 3,
      business_connection: {
        id: 'BC2',
        user: { id: OWNER, is_bot: false, first_name: 'Komodo' },
        user_chat_id: OWNER,
        date: 0,
        is_enabled: true,
        rights: {},
      },
    } as never);
    expect(admin[0]).toContain('Reply to messages');
  });
});
