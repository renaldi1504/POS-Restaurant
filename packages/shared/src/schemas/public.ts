import { z } from 'zod';
import { Currency, CustomerMode, Lang, OrderType, PublicPaymentMethod } from '../enums';
import { Id, Lat, Lng, MoneyAmount } from './common';
import { AddressDto, DeliveryInfoInput, OrderItemInput, PublicOrderDto } from './orders';
import { TableSessionDto } from './tables';

export const CustomerDto = z.object({
  id: Id,
  name: z.string().nullable(),
  username: z.string().nullable(),
  phone: z.string().nullable(),
  lang: Lang,
  telegramId: z.string().nullable(),
});
export type CustomerDto = z.infer<typeof CustomerDto>;

export const PublicTableRef = z.object({ id: Id, name: z.string(), area: z.string() });
export type PublicTableRef = z.infer<typeof PublicTableRef>;

/** `POST /public/session/telegram` — initData dari Telegram WebApp (HMAC divalidasi server, max 24 jam). */
export const TelegramSessionRequest = z.object({ initData: z.string().min(1).max(8192) });
export type TelegramSessionRequest = z.infer<typeof TelegramSessionRequest>;

/** `POST /public/session/table` — dari URL `/m/<qrToken>`. */
export const TableSessionRequest = z.object({ qrToken: z.string().min(16).max(64) });
export type TableSessionRequest = z.infer<typeof TableSessionRequest>;

/** Sesi pelanggan saat ini (cookie `pos_cust`). Juga respons `GET /public/session`. */
export const CustomerSessionResponse = z.object({
  mode: CustomerMode,
  customer: CustomerDto.nullable(),
  table: PublicTableRef.nullable(),
  /** Sesi meja yang sedang terbuka (null bila belum ada pesanan). */
  tableSession: TableSessionDto.nullable(),
});
export type CustomerSessionResponse = z.infer<typeof CustomerSessionResponse>;

/**
 * `POST /public/orders`.
 * - mode telegram: type selalu delivery, `addressId` milik pelanggan wajib.
 * - mode table: type dine_in, masuk ke sesi meja (channel qr), tanpa pembayaran di muka.
 * - mode none (website biasa): `contact` + `address` wajib untuk delivery.
 * Harga dihitung ulang server.
 */
export const PublicCreateOrderRequest = z.object({
  type: OrderType.optional(),
  items: z.array(OrderItemInput).min(1).max(50),
  note: z.string().trim().max(300).optional(),
  paymentMethod: PublicPaymentMethod.optional(),
  addressId: Id.optional(),
  /** Untuk pelanggan tanpa login (website biasa). */
  contact: DeliveryInfoInput.optional(),
  lang: Lang.optional(),
});
export type PublicCreateOrderRequest = z.input<typeof PublicCreateOrderRequest>;

export const PublicOrderResponse = z.object({ order: PublicOrderDto });
export type PublicOrderResponse = z.infer<typeof PublicOrderResponse>;

/** `GET /public/table/bill` — tagihan berjalan meja dari sesi cookie. */
export const PublicTableBillResponse = z.object({
  table: PublicTableRef,
  session: TableSessionDto.nullable(),
  orders: z.array(PublicOrderDto),
  total: MoneyAmount,
  paid: MoneyAmount,
  remaining: MoneyAmount,
  currency: Currency,
});
export type PublicTableBillResponse = z.infer<typeof PublicTableBillResponse>;

export const BillRequestResponse = z.object({ session: TableSessionDto });
export type BillRequestResponse = z.infer<typeof BillRequestResponse>;

// ---------- Alamat ----------
export const AddressesResponse = z.object({ addresses: z.array(AddressDto) });
export type AddressesResponse = z.infer<typeof AddressesResponse>;
export const AddressResponse = z.object({ address: AddressDto });
export type AddressResponse = z.infer<typeof AddressResponse>;

export const CreateAddressRequest = z.object({
  label: z.string().trim().min(1).max(50).default('Rumah'),
  text: z.string().trim().min(1).max(300),
  landmark: z.string().trim().max(200).optional(),
  lat: Lat,
  lng: Lng,
});
export type CreateAddressRequest = z.input<typeof CreateAddressRequest>;
export const UpdateAddressRequest = z.object({
  label: z.string().trim().min(1).max(50).optional(),
  text: z.string().trim().min(1).max(300).optional(),
  landmark: z.string().trim().max(200).nullable().optional(),
  lat: Lat.optional(),
  lng: Lng.optional(),
});
export type UpdateAddressRequest = z.infer<typeof UpdateAddressRequest>;

/** `PATCH /public/session` — ubah bahasa/no HP pelanggan. */
export const UpdateCustomerRequest = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  phone: z.string().trim().max(50).nullable().optional(),
  lang: Lang.optional(),
});
export type UpdateCustomerRequest = z.infer<typeof UpdateCustomerRequest>;
