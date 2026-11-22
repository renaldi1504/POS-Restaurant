/**
 * Kontrak realtime Socket.IO (path `/ws`). SPEC §6.
 *
 * Server menaruh socket ke room otomatis saat connect, berdasarkan cookie sesi:
 * - staf: dari permission → `cashier` (order.create|order.accept), `kitchen` (kitchen.view),
 *   `driver` (driver.deliver), `admin` (settings.manage)
 * - pelanggan: `customer:<customerId>`; mode meja: `table:<sessionId>` (sesi meja terbuka)
 *
 * Klien menyimpan `lastEventAt` (pakai `serverTime`/`at`); saat reconnect memanggil `GET /orders?since=`.
 */
import { z } from 'zod';
import { TableStatus } from './enums';
import type { PermissionKey } from './permissions';
import { Id, IsoDateTime, Uuid } from './schemas/common';
import { OrderDto, PublicOrderDto } from './schemas/orders';

export const ROOMS = {
  cashier: 'cashier',
  kitchen: 'kitchen',
  driver: 'driver',
  admin: 'admin',
  customer: (customerId: number) => `customer:${customerId}`,
  table: (sessionId: number) => `table:${sessionId}`,
} as const;
export type StaffRoom = 'cashier' | 'kitchen' | 'driver' | 'admin';

/** Room staf berdasarkan permission. */
export function staffRoomsFor(perms: readonly PermissionKey[] | readonly string[]): StaffRoom[] {
  const p = perms as readonly string[];
  const rooms: StaffRoom[] = [];
  if (p.includes('order.create') || p.includes('order.accept')) rooms.push('cashier');
  if (p.includes('kitchen.view')) rooms.push('kitchen');
  if (p.includes('driver.deliver')) rooms.push('driver');
  if (p.includes('settings.manage')) rooms.push('admin');
  return rooms;
}

export const SOCKET_EVENTS = {
  orderCreated: 'order.created',
  orderUpdated: 'order.updated',
  orderReadyForPickup: 'order.ready_for_pickup',
  tableUpdated: 'table.updated',
  menuAvailability: 'menu.availability',
  /** Menu/kategori/opsi/promo diubah admin → klien muat ulang menu. */
  menuChanged: 'menu.changed',
  paymentProofReceived: 'payment.proof_received',
} as const;
export type SocketEventName = (typeof SOCKET_EVENTS)[keyof typeof SOCKET_EVENTS];

// ---------- Payload (staf) ----------
const withAt = { at: IsoDateTime };
export const OrderEventPayload = z.object({ order: OrderDto, ...withAt });
export type OrderEventPayload = z.infer<typeof OrderEventPayload>;
export const PublicOrderEventPayload = z.object({ order: PublicOrderDto, ...withAt });
export type PublicOrderEventPayload = z.infer<typeof PublicOrderEventPayload>;
export const TableUpdatedPayload = z.object({
  tableId: Id,
  sessionId: Id.nullable(),
  status: TableStatus,
  ...withAt,
});
export type TableUpdatedPayload = z.infer<typeof TableUpdatedPayload>;
export const MenuAvailabilityPayload = z.object({
  kind: z.enum(['item', 'option']),
  id: Id,
  available: z.boolean(),
  ...withAt,
});
export type MenuAvailabilityPayload = z.infer<typeof MenuAvailabilityPayload>;
export const MenuChangedPayload = z.object({ ...withAt });
export type MenuChangedPayload = z.infer<typeof MenuChangedPayload>;
export const PaymentProofPayload = z.object({
  orderId: Uuid,
  paymentId: Id,
  displayNo: z.string(),
  ...withAt,
});
export type PaymentProofPayload = z.infer<typeof PaymentProofPayload>;

/** Event yang diterima pos-web (room staf). */
export interface StaffServerToClientEvents {
  'order.created': (p: OrderEventPayload) => void;
  'order.updated': (p: OrderEventPayload) => void;
  'order.ready_for_pickup': (p: OrderEventPayload) => void;
  'table.updated': (p: TableUpdatedPayload) => void;
  'menu.availability': (p: MenuAvailabilityPayload) => void;
  'menu.changed': (p: MenuChangedPayload) => void;
  'payment.proof_received': (p: PaymentProofPayload) => void;
}

/** Event yang diterima order-web (room customer:<id> / table:<sessionId>). */
export interface CustomerServerToClientEvents {
  'order.created': (p: PublicOrderEventPayload) => void;
  'order.updated': (p: PublicOrderEventPayload) => void;
  'table.updated': (p: TableUpdatedPayload) => void;
  'menu.availability': (p: MenuAvailabilityPayload) => void;
  'menu.changed': (p: MenuChangedPayload) => void;
}

/** Event klien → server. */
export interface ClientToServerEvents {
  /** Cek koneksi; server membalas waktu server (ISO) untuk sinkron `lastEventAt`. */
  ping: (ack: (serverTime: string) => void) => void;
}

export interface SocketData {
  kind: 'staff' | 'customer' | 'anonymous';
  userId?: number;
  customerId?: number;
  tableId?: number;
}
