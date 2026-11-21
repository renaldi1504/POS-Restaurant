/** Label dari data server yang perlu diterjemahkan di UI staf (nama role bawaan, izin). */
import type { TFunction } from 'i18next';
import { ROLE_NAMES, permissionI18nKey, type PermissionKey } from '@pos/shared';

/** Nama role bawaan (Owner/Kasir/Dapur/Driver/Bot Telegram) → bahasa UI; role buatan admin apa adanya. */
export function roleLabel(name: string, t: TFunction): string {
  const key = (Object.keys(ROLE_NAMES) as (keyof typeof ROLE_NAMES)[]).find((k) => ROLE_NAMES[k] === name);
  return key ? t(`role.${key}`) : name;
}

/** Label izin (editor role) dalam bahasa UI. */
export function permLabel(k: PermissionKey, t: TFunction): string {
  return t(permissionI18nKey(k));
}
