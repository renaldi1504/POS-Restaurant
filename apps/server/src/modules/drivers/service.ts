import { and, eq, inArray, isNull, notInArray } from 'drizzle-orm';
import {
  haversineKm,
  mapsDirectionsUrl,
  mapsMultiStopUrl,
  type DriverOrderDto,
  type OrderDto,
  type Settings,
} from '@pos/shared';
import type { DbOrTx } from '../../db/client';
import { driverSettlements, orders, payments } from '../../db/schema';
import { loadOrderDtos, netMain, paymentCounts } from '../orders/dto';

/** Channel platform punya kurir sendiri → tidak tampil di aplikasi driver. */
export const PLATFORM_CHANNELS = ['grab', 'foodpanda'] as const;

export function toDriverOrder(o: OrderDto, settings: Settings): DriverOrderDto {
  const a = o.address;
  const hasDest = a?.lat != null && a?.lng != null;
  const origin =
    settings.profile.lat != null && settings.profile.lng != null
      ? { lat: settings.profile.lat, lng: settings.profile.lng }
      : null;
  const distanceKm =
    hasDest && origin ? Math.round(haversineKm(origin, { lat: a!.lat!, lng: a!.lng! }) * 100) / 100 : null;
  const cashToCollect =
    o.paymentStatus === 'paid' || o.paymentStatus === 'pending_verification'
      ? 0
      : Math.max(0, o.total - o.paidMain);
  return {
    ...o,
    distanceKm,
    navigateUrl: hasDest ? mapsDirectionsUrl({ lat: a!.lat!, lng: a!.lng! }) : null,
    cashToCollect,
  };
}

export async function availableOrders(db: DbOrTx, settings: Settings): Promise<DriverOrderDto[]> {
  const list = await loadOrderDtos(
    db,
    and(
      eq(orders.type, 'delivery'),
      eq(orders.status, 'ready'),
      isNull(orders.driverId),
      notInArray(orders.channel, [...PLATFORM_CHANNELS]),
    ),
  );
  return list
    .map((o) => toDriverOrder(o, settings))
    .sort((a, b) => (a.distanceKm ?? 1e9) - (b.distanceKm ?? 1e9) || a.createdAt.localeCompare(b.createdAt));
}

export async function myOrders(db: DbOrTx, driverId: number, settings: Settings) {
  const list = (
    await loadOrderDtos(
      db,
      and(eq(orders.driverId, driverId), inArray(orders.status, ['ready', 'picked_up'])),
    )
  ).map((o) => toDriverOrder(o, settings));
  const stops = list
    .filter((o) => o.address?.lat != null && o.address?.lng != null)
    .map((o) => ({ lat: o.address!.lat!, lng: o.address!.lng! }));

  // Cash dibawa: pembayaran cash yang saya tagih (order saya) di shift yang setorannya belum ditandai.
  const mine = await db
    .select({ p: payments, shiftId: payments.shiftId })
    .from(payments)
    .innerJoin(orders, eq(orders.id, payments.orderId))
    .where(and(eq(orders.driverId, driverId), eq(payments.createdBy, driverId), eq(payments.method, 'cash')));
  const settledRows = await db
    .select()
    .from(driverSettlements)
    .where(eq(driverSettlements.driverId, driverId));
  const settledShiftIds = new Set(settledRows.filter((r) => r.settledAt).map((r) => r.shiftId));
  const cashCarried = mine
    .filter(({ p }) => paymentCounts(p) && !(p.shiftId && settledShiftIds.has(p.shiftId)))
    .reduce((a, { p }) => a + netMain(p), 0);
  const delivered = await db
    .select({ id: orders.id, shiftId: orders.shiftId })
    .from(orders)
    .where(and(eq(orders.driverId, driverId), inArray(orders.status, ['delivered', 'done'])));
  const deliveredCount = delivered.filter((d) => !(d.shiftId && settledShiftIds.has(d.shiftId))).length;
  return { orders: list, navigateAllUrl: mapsMultiStopUrl(stops), cashCarried, deliveredCount };
}
