/**
 * Sesi cookie (staf & pelanggan).
 *
 * - Cookie `pos_sid` (staf) / `pos_cust` (pelanggan) berisi id sesi acak 32 byte, DITANDATANGANI
 *   dengan SESSION_SECRET (@fastify/cookie signed), httpOnly, SameSite=Lax, Secure di production.
 * - Data sesi di tabel `sessions` (bisa dicabut: logout, nonaktifkan user).
 * - Staf: `request.staff` diisi oleh hook `loadSessions` untuk setiap request.
 * - Pelanggan: `request.customer` (customerId dan/atau tableId).
 */
import { randomBytes } from 'node:crypto';
import { and, eq, gt } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  CUSTOMER_SESSION_COOKIE,
  hasPermission,
  PermissionKey,
  STAFF_SESSION_COOKIE,
  type Lang,
  type StaffUser,
} from '@pos/shared';
import type { Db } from '../db/client';
import { roles, sessions, users } from '../db/schema';
import { forbidden, unauthorized } from './errors';

export interface StaffContext {
  sessionId: string;
  id: number;
  name: string;
  lang: Lang;
  roleId: number;
  roleName: string;
  permissions: PermissionKey[];
}

export interface CustomerContext {
  sessionId: string;
  customerId: number | null;
  tableId: number | null;
}

export function newSessionId(): string {
  return randomBytes(32).toString('base64url');
}

export function toStaffUser(s: StaffContext): StaffUser {
  return {
    id: s.id,
    name: s.name,
    lang: s.lang,
    role: { id: s.roleId, name: s.roleName },
    permissions: s.permissions,
  };
}

function cookieOpts(app: FastifyInstance, expires: Date) {
  return {
    path: '/',
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: app.config.isProd,
    signed: true,
    expires,
  };
}

function readSignedCookie(app: FastifyInstance, raw: string | undefined): string | null {
  if (!raw) return null;
  const r = app.unsignCookie(raw);
  return r.valid && r.value ? r.value : null;
}

// ---------- Staf ----------
export async function loadStaffBySessionId(db: Db, sessionId: string): Promise<StaffContext | null> {
  const rows = await db
    .select({
      sessionId: sessions.id,
      id: users.id,
      name: users.name,
      lang: users.lang,
      active: users.active,
      roleId: roles.id,
      roleName: roles.name,
      permissions: roles.permissions,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .innerJoin(roles, eq(roles.id, users.roleId))
    .where(and(eq(sessions.id, sessionId), eq(sessions.kind, 'staff'), gt(sessions.expiresAt, new Date())))
    .limit(1);
  const r = rows[0];
  if (!r || !r.active) return null;
  return {
    sessionId: r.sessionId,
    id: r.id,
    name: r.name,
    lang: r.lang as Lang,
    roleId: r.roleId,
    roleName: r.roleName,
    permissions: (r.permissions ?? []).filter((p): p is PermissionKey => PermissionKey.safeParse(p).success),
  };
}

export async function createStaffSession(
  app: FastifyInstance,
  reply: FastifyReply,
  userId: number,
  userAgent?: string,
): Promise<{ id: string; expiresAt: Date }> {
  const id = newSessionId();
  const expiresAt = new Date(Date.now() + app.config.SESSION_TTL_HOURS * 3600_000);
  await app.db
    .insert(sessions)
    .values({ id, kind: 'staff', userId, expiresAt, userAgent: userAgent?.slice(0, 300) });
  reply.setCookie(STAFF_SESSION_COOKIE, id, cookieOpts(app, expiresAt));
  return { id, expiresAt };
}

export async function destroyStaffSession(app: FastifyInstance, req: FastifyRequest, reply: FastifyReply) {
  const id = readSignedCookie(app, req.cookies[STAFF_SESSION_COOKIE]);
  if (id) await app.db.delete(sessions).where(eq(sessions.id, id));
  reply.clearCookie(STAFF_SESSION_COOKIE, { path: '/' });
}

// ---------- Pelanggan ----------
export async function loadCustomerBySessionId(db: Db, sessionId: string): Promise<CustomerContext | null> {
  const rows = await db
    .select({ sessionId: sessions.id, customerId: sessions.customerId, tableId: sessions.tableId })
    .from(sessions)
    .where(and(eq(sessions.id, sessionId), eq(sessions.kind, 'customer'), gt(sessions.expiresAt, new Date())))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Buat / perbarui sesi pelanggan (telegram → customerId; QR meja → tableId; tamu website → customerId tamu).
 * Bila request sudah punya sesi pelanggan, sesi itu diperbarui (mis. scan QR setelah login Telegram).
 */
export async function upsertCustomerSession(
  app: FastifyInstance,
  req: FastifyRequest,
  reply: FastifyReply,
  data: { customerId?: number | null; tableId?: number | null },
): Promise<CustomerContext> {
  const expiresAt = new Date(Date.now() + app.config.CUSTOMER_SESSION_TTL_DAYS * 86400_000);
  const existing = req.customer;
  if (existing) {
    const next = {
      customerId: data.customerId !== undefined ? data.customerId : existing.customerId,
      tableId: data.tableId !== undefined ? data.tableId : existing.tableId,
    };
    await app.db
      .update(sessions)
      .set({ ...next, expiresAt, lastSeenAt: new Date() })
      .where(eq(sessions.id, existing.sessionId));
    reply.setCookie(CUSTOMER_SESSION_COOKIE, existing.sessionId, cookieOpts(app, expiresAt));
    req.customer = { sessionId: existing.sessionId, ...next };
    return req.customer;
  }
  const id = newSessionId();
  const ctx: CustomerContext = {
    sessionId: id,
    customerId: data.customerId ?? null,
    tableId: data.tableId ?? null,
  };
  await app.db.insert(sessions).values({
    id,
    kind: 'customer',
    customerId: ctx.customerId,
    tableId: ctx.tableId,
    expiresAt,
    userAgent: req.headers['user-agent']?.slice(0, 300),
  });
  reply.setCookie(CUSTOMER_SESSION_COOKIE, id, cookieOpts(app, expiresAt));
  req.customer = ctx;
  return ctx;
}

export async function destroyCustomerSession(app: FastifyInstance, req: FastifyRequest, reply: FastifyReply) {
  if (req.customer) await app.db.delete(sessions).where(eq(sessions.id, req.customer.sessionId));
  req.customer = null;
  reply.clearCookie(CUSTOMER_SESSION_COOKIE, { path: '/' });
}

/** Resolve sesi dari cookie (dipakai hook HTTP & handshake Socket.IO). */
export async function resolveSessionsFromCookies(
  app: FastifyInstance,
  cookies: Record<string, string | undefined>,
): Promise<{ staff: StaffContext | null; customer: CustomerContext | null }> {
  const staffId = readSignedCookie(app, cookies[STAFF_SESSION_COOKIE]);
  const custId = readSignedCookie(app, cookies[CUSTOMER_SESSION_COOKIE]);
  const [staff, customer] = await Promise.all([
    staffId ? loadStaffBySessionId(app.db, staffId) : null,
    custId ? loadCustomerBySessionId(app.db, custId) : null,
  ]);
  return { staff, customer };
}

/** Hook: isi request.staff / request.customer (hanya untuk /api & /uploads/private). */
export function registerSessionHook(app: FastifyInstance): void {
  app.decorateRequest('staff', null);
  app.decorateRequest('customer', null);
  app.addHook('onRequest', async (req) => {
    if (!req.url.startsWith('/api/') && !req.url.startsWith('/uploads/private/')) return;
    const { staff, customer } = await resolveSessionsFromCookies(app, req.cookies);
    req.staff = staff;
    req.customer = customer;
  });
}

// ---------- Guard ----------
/** Lempar 401 bila belum login staf. */
export function requireStaff(req: FastifyRequest): StaffContext {
  if (!req.staff) throw unauthorized();
  return req.staff;
}

/** Lempar 401/403 bila staf tidak punya SALAH SATU permission. */
export function assertPermission(req: FastifyRequest, ...keys: PermissionKey[]): StaffContext {
  const staff = requireStaff(req);
  if (keys.length && !keys.some((k) => hasPermission(staff.permissions, k))) {
    throw forbidden(`Butuh izin: ${keys.join(' / ')}`);
  }
  return staff;
}

/**
 * preHandler Fastify untuk route di luar registri kontrak:
 *   app.get('/x', { preHandler: requirePermission('menu.manage') }, handler)
 */
export function requirePermission(...keys: PermissionKey[]) {
  return async (req: FastifyRequest) => {
    assertPermission(req, ...keys);
  };
}

/** Sesi pelanggan wajib (401 bila tidak ada). */
export function requireCustomer(req: FastifyRequest): CustomerContext {
  if (!req.customer) throw unauthorized('Sesi pelanggan tidak ditemukan');
  return req.customer;
}
