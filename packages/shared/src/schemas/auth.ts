import { z } from 'zod';
import { Lang } from '../enums';
import { PermissionList } from '../permissions';
import { Id, IsoDateTime, Pin } from './common';

/** Kartu di layar login: `GET /auth/users`. */
export const LoginUserCard = z.object({
  id: Id,
  name: z.string(),
  roleId: Id,
  roleName: z.string(),
  /** Inisial untuk avatar, mis. "KP". */
  initials: z.string(),
  locked: z.boolean(),
});
export type LoginUserCard = z.infer<typeof LoginUserCard>;
export const AuthUsersResponse = z.object({ users: z.array(LoginUserCard) });
export type AuthUsersResponse = z.infer<typeof AuthUsersResponse>;

export const PinLoginRequest = z.object({ userId: Id, pin: Pin });
export type PinLoginRequest = z.infer<typeof PinLoginRequest>;

/** User staf yang sedang login. */
export const StaffUser = z.object({
  id: Id,
  name: z.string(),
  lang: Lang,
  role: z.object({ id: Id, name: z.string() }),
  permissions: PermissionList,
});
export type StaffUser = z.infer<typeof StaffUser>;

export const PinLoginResponse = z.object({ user: StaffUser, expiresAt: IsoDateTime });
export type PinLoginResponse = z.infer<typeof PinLoginResponse>;

export const MeResponse = z.object({ user: StaffUser });
export type MeResponse = z.infer<typeof MeResponse>;

/** `PATCH /auth/me/lang` — staf memilih bahasa tampilannya sendiri. */
export const MeLangRequest = z.object({ lang: Lang });
export type MeLangRequest = z.infer<typeof MeLangRequest>;

/** Detail error PIN_INVALID / PIN_LOCKED (di `error.details`). */
export const PinErrorDetails = z.object({
  remainingAttempts: z.number().int().nonnegative().optional(),
  lockedUntil: IsoDateTime.optional(),
});
export type PinErrorDetails = z.infer<typeof PinErrorDetails>;
