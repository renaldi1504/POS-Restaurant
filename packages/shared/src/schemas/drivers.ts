import { z } from 'zod';
import { Currency } from '../enums';
import { Id, MoneyAmount, PositiveMoney } from './common';
import { OrderDto } from './orders';

/** Order delivery dilihat driver. */
export const DriverOrderDto = OrderDto.extend({
  /** Jarak lurus (haversine) dari restoran ke tujuan, km; null bila koordinat tidak ada. */
  distanceKm: z.number().nullable(),
  /** `https://www.google.com/maps/dir/?api=1&destination=LAT,LNG` */
  navigateUrl: z.string().nullable(),
  /** Yang harus ditagih tunai saat antar (0 bila sudah lunas/ABA), mata uang utama. */
  cashToCollect: MoneyAmount,
});
export type DriverOrderDto = z.infer<typeof DriverOrderDto>;

/** `GET /driver/available` — order delivery `ready` tanpa driver. */
export const DriverAvailableResponse = z.object({ orders: z.array(DriverOrderDto) });
export type DriverAvailableResponse = z.infer<typeof DriverAvailableResponse>;

/** `GET /driver/mine` — antaran saya yang belum selesai + cash dibawa shift ini. */
export const DriverMineResponse = z.object({
  orders: z.array(DriverOrderDto),
  /** Navigasi semua tujuan (pakai `waypoints`); null bila < 1 tujuan berkoordinat. */
  navigateAllUrl: z.string().nullable(),
  /** Total cash yang sudah ditagih & belum disetor (mata uang utama). */
  cashCarried: MoneyAmount,
  deliveredCount: z.number().int().nonnegative(),
});
export type DriverMineResponse = z.infer<typeof DriverMineResponse>;

/** `POST /driver/orders/:id/delivered` — cash yang ditagih (bila bayar di tempat). */
export const DriverDeliveredRequest = z
  .object({ collected: z.object({ currency: Currency, amount: PositiveMoney }).optional() })
  .default({});
export type DriverDeliveredRequest = z.input<typeof DriverDeliveredRequest>;

/** `POST /driver/orders/:id/release` — driver melepas; admin boleh memindah ke driver lain. */
export const DriverReleaseRequest = z
  .object({ reason: z.string().max(300).optional(), toDriverId: Id.optional() })
  .default({});
export type DriverReleaseRequest = z.input<typeof DriverReleaseRequest>;

export const DriverOrderResponse = z.object({ order: DriverOrderDto });
export type DriverOrderResponse = z.infer<typeof DriverOrderResponse>;
