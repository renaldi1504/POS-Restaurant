/**
 * Tautan "Pesan sekarang" untuk chat Telegram Business: tombol web_app tidak diizinkan di sana, jadi
 * dipakai URL biasa ke web order yang membawa token bertanda tangan (id Telegram + kedaluwarsa).
 * Web order menukar token itu menjadi sesi pelanggan Telegram — pesanan & notifikasi tetap tersambung.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

export const ORDER_LINK_TTL_SEC = 7 * 24 * 3600;

const b64 = (s: string) => Buffer.from(s).toString('base64url');
const sign = (secret: string, payload: string) =>
  createHmac('sha256', `tg-order-link:${secret}`).update(payload).digest('base64url').slice(0, 32);

export function createOrderLinkToken(secret: string, telegramId: string, nowSec: number): string {
  const payload = b64(`${telegramId}.${nowSec + ORDER_LINK_TTL_SEC}`);
  return `${payload}.${sign(secret, payload)}`;
}

export function verifyOrderLinkToken(
  secret: string,
  token: string,
  nowSec: number,
): { ok: true; telegramId: string } | { ok: false; reason: 'invalid' | 'expired' } {
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return { ok: false, reason: 'invalid' };
  const want = Buffer.from(sign(secret, payload));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return { ok: false, reason: 'invalid' };
  const [id, exp] = Buffer.from(payload, 'base64url').toString().split('.');
  if (!id || !/^\d{1,20}$/.test(id) || !exp) return { ok: false, reason: 'invalid' };
  if (Number(exp) < nowSec) return { ok: false, reason: 'expired' };
  return { ok: true, telegramId: id };
}
