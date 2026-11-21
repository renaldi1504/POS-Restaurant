/**
 * Validasi initData Telegram Mini App (https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app):
 *   secret = HMAC_SHA256(key="WebAppData", msg=bot_token)
 *   hash   = hex(HMAC_SHA256(key=secret, msg=data_check_string))
 * data_check_string = semua field kecuali `hash`, urut abjad, "key=value" dipisah "\n".
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { TELEGRAM_INITDATA_MAX_AGE_SEC } from '@pos/shared';

export interface TelegramWebAppUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

export type InitDataResult =
  | { ok: true; user: TelegramWebAppUser; authDate: number }
  | { ok: false; reason: 'malformed' | 'bad_hash' | 'expired' | 'no_user' };

export function dataCheckString(params: URLSearchParams): string {
  return [...params.entries()]
    .filter(([k]) => k !== 'hash')
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
}

export function signInitData(params: Record<string, string>, botToken: string): string {
  const sp = new URLSearchParams(params);
  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const hash = createHmac('sha256', secret).update(dataCheckString(sp)).digest('hex');
  sp.set('hash', hash);
  return sp.toString();
}

export function validateInitData(
  initData: string,
  botToken: string | null,
  opts: { nowSec?: number; maxAgeSec?: number } = {},
): InitDataResult {
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(initData);
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  const hash = params.get('hash');
  const authDate = Number(params.get('auth_date'));
  if (!Number.isFinite(authDate) || authDate <= 0) return { ok: false, reason: 'malformed' };
  if (botToken) {
    if (!hash || !/^[0-9a-f]{64}$/i.test(hash)) return { ok: false, reason: 'bad_hash' };
    const secret = createHmac('sha256', 'WebAppData').update(botToken).digest();
    const expected = createHmac('sha256', secret).update(dataCheckString(params)).digest();
    const got = Buffer.from(hash, 'hex');
    if (got.length !== expected.length || !timingSafeEqual(got, expected))
      return { ok: false, reason: 'bad_hash' };
  }
  const nowSec = opts.nowSec ?? Math.floor(Date.now() / 1000);
  if (nowSec - authDate > (opts.maxAgeSec ?? TELEGRAM_INITDATA_MAX_AGE_SEC))
    return { ok: false, reason: 'expired' };
  const rawUser = params.get('user');
  if (!rawUser) return { ok: false, reason: 'no_user' };
  try {
    const user = JSON.parse(rawUser) as TelegramWebAppUser;
    if (typeof user.id !== 'number') return { ok: false, reason: 'no_user' };
    return { ok: true, user, authDate };
  } catch {
    return { ok: false, reason: 'malformed' };
  }
}

/** language_code Telegram → bahasa aplikasi. */
export function langFromTelegram(code: string | undefined): 'id' | 'en' | 'kh' | 'zh' | null {
  if (!code) return null;
  const c = code.toLowerCase();
  if (c.startsWith('km')) return 'kh';
  if (c.startsWith('zh')) return 'zh';
  if (c.startsWith('id') || c.startsWith('ms')) return 'id';
  if (c.startsWith('en')) return 'en';
  return null;
}
