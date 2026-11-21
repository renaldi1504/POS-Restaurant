/** Emit realtime & antrian notifikasi untuk perubahan order. */
import type { FastifyInstance } from 'fastify';
import type { OrderDto, StaffRoom } from '@pos/shared';
import { now } from '../../lib/clock';
import { JOB_NAMES } from '../../lib/jobs';
import { toPublicOrder } from './dto';

const DRIVER_STATUSES = ['ready', 'picked_up', 'delivered'];

export function staffRoomsForOrder(o: OrderDto): StaffRoom[] {
  const rooms: StaffRoom[] = ['cashier', 'kitchen', 'admin'];
  if (o.type === 'delivery' && (DRIVER_STATUSES.includes(o.status) || o.driver)) rooms.push('driver');
  return rooms;
}

export function emitOrderEvent(
  app: FastifyInstance,
  event: 'order.created' | 'order.updated',
  o: OrderDto,
): void {
  const at = now().toISOString();
  app.realtime.emitStaff(staffRoomsForOrder(o), event, { order: o, at });
  const pub = { order: toPublicOrder(o), at };
  if (o.customer) app.realtime.emitCustomer(o.customer.id, event, pub);
  if (o.tableSessionId) app.realtime.emitTable(o.tableSessionId, event, pub);
}

export function emitReadyForPickup(app: FastifyInstance, o: OrderDto): void {
  app.realtime.emitStaff(['driver'], 'order.ready_for_pickup', { order: o, at: now().toISOString() });
}

/** Antrikan notifikasi status ke chat Telegram pelanggan (retry 3x). */
export async function notifyTelegram(app: FastifyInstance, o: OrderDto): Promise<void> {
  if (!o.customer?.telegramId) return;
  try {
    await app.jobs.enqueue(
      JOB_NAMES.telegramNotify,
      { orderId: o.id, status: o.status },
      { retryLimit: 3, singletonKey: `${o.id}:${o.status}` },
    );
  } catch (err) {
    app.log.warn({ err }, 'Gagal antre notifikasi Telegram');
  }
}
