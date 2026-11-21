import { z } from 'zod';
import {
  Currency,
  OrderChannel,
  OrderStatus,
  OrderType,
  PaymentMethod,
  PaymentStatus,
  PromoKind,
  StaffOrderChannel,
} from '../enums';
import { LocalizedText } from '../localized';
import {
  Id,
  IsoDateTime,
  IsoDateTimeInput,
  Lat,
  Lng,
  MoneyAmount,
  NonNegMoney,
  Pin,
  QueryBool,
  UserRef,
  Uuid,
  Ymd,
} from './common';
import { OptionSnapshot } from './menu';

/** Item di request order. Harga TIDAK dikirim klien — server menghitung ulang dari DB. */
export const OrderItemInput = z.object({
  itemId: Id,
  qty: z.number().int().min(1).max(99),
  optionIds: z.array(Id).max(30).default([]),
  note: z.string().trim().max(200).optional(),
});
export type OrderItemInput = z.input<typeof OrderItemInput>;

/** Potongan manual oleh kasir. */
export const ManualDiscount = z.object({ kind: PromoKind, value: z.number().nonnegative() });
export type ManualDiscount = z.infer<typeof ManualDiscount>;

/** Data tujuan delivery yang diketik kasir (order telepon) atau pelanggan tanpa login. */
export const DeliveryInfoInput = z.object({
  name: z.string().trim().min(1).max(100),
  phone: z.string().trim().max(50).optional(),
  addressText: z.string().trim().min(1).max(300),
  landmark: z.string().trim().max(200).optional(),
  lat: Lat.optional(),
  lng: Lng.optional(),
});
export type DeliveryInfoInput = z.infer<typeof DeliveryInfoInput>;

/** `POST /orders` (staf). */
export const CreateOrderRequest = z
  .object({
    channel: StaffOrderChannel.default('kasir'),
    type: OrderType,
    items: z.array(OrderItemInput).min(1).max(100),
    /** Wajib untuk dine_in: order masuk ke sesi meja (dibuka otomatis bila belum ada). */
    tableId: Id.optional(),
    /** Kode aplikasi Grab/foodpanda, mis. "GF-482". */
    displayNo: z.string().trim().min(1).max(20).optional(),
    customerName: z.string().trim().max(100).optional(),
    delivery: DeliveryInfoInput.optional(),
    deliveryFee: NonNegMoney.optional(),
    promoId: Id.optional(),
    discount: ManualDiscount.optional(),
    note: z.string().trim().max(300).optional(),
  })
  .refine((v) => v.type !== 'dine_in' || v.tableId !== undefined, {
    message: 'Meja wajib dipilih untuk makan di sini',
    path: ['tableId'],
  });
export type CreateOrderRequest = z.input<typeof CreateOrderRequest>;

/** `PATCH /orders/:id` — hanya sebelum dibayar (setelah bayar: ORDER_LOCKED). */
export const UpdateOrderRequest = z.object({
  /** Mengganti seluruh item. */
  items: z.array(OrderItemInput).min(1).max(100).optional(),
  type: OrderType.optional(),
  displayNo: z.string().trim().min(1).max(20).nullable().optional(),
  customerName: z.string().trim().max(100).nullable().optional(),
  delivery: DeliveryInfoInput.optional(),
  deliveryFee: NonNegMoney.optional(),
  promoId: Id.nullable().optional(),
  discount: ManualDiscount.nullable().optional(),
  note: z.string().trim().max(300).nullable().optional(),
});
export type UpdateOrderRequest = z.input<typeof UpdateOrderRequest>;

export const OrderItemDto = z.object({
  id: Id,
  itemId: Id.nullable(),
  name: LocalizedText,
  qty: z.number().int(),
  /** Harga satuan dasar (tanpa opsi). */
  unitPrice: MoneyAmount,
  options: z.array(OptionSnapshot),
  /** (unitPrice + Σ priceDelta) × qty */
  lineTotal: MoneyAmount,
  note: z.string().nullable(),
});
export type OrderItemDto = z.infer<typeof OrderItemDto>;

export const AddressDto = z.object({
  id: Id,
  label: z.string(),
  text: z.string(),
  landmark: z.string().nullable(),
  lat: z.number().nullable(),
  lng: z.number().nullable(),
});
export type AddressDto = z.infer<typeof AddressDto>;

export const CustomerRef = z.object({
  id: Id,
  name: z.string().nullable(),
  username: z.string().nullable(),
  phone: z.string().nullable(),
  telegramId: z.string().nullable(),
});
export type CustomerRef = z.infer<typeof CustomerRef>;

export const PaymentDto = z.object({
  id: Id,
  orderId: Uuid.nullable(),
  tableSessionId: Id.nullable(),
  method: PaymentMethod,
  currency: Currency,
  /** Jumlah diterima dalam `currency` (minor). */
  amount: MoneyAmount,
  /** Nilai `amount` dalam mata uang utama. */
  amountMain: MoneyAmount,
  /** Kembalian dalam mata uang utama. */
  changeMain: MoneyAmount,
  proofUrl: z.string().nullable(),
  verifiedBy: UserRef.nullable(),
  verifiedAt: IsoDateTime.nullable(),
  createdBy: UserRef.nullable(),
  createdAt: IsoDateTime,
});
export type PaymentDto = z.infer<typeof PaymentDto>;

export const OrderTimestamps = z.object({
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
  acceptedAt: IsoDateTime.nullable(),
  cookingAt: IsoDateTime.nullable(),
  readyAt: IsoDateTime.nullable(),
  pickedUpAt: IsoDateTime.nullable(),
  deliveredAt: IsoDateTime.nullable(),
  servedAt: IsoDateTime.nullable(),
  doneAt: IsoDateTime.nullable(),
  cancelledAt: IsoDateTime.nullable(),
});

/** Order lengkap untuk staf. */
export const OrderDto = OrderTimestamps.extend({
  id: Uuid,
  businessDate: Ymd,
  number: z.number().int(),
  /** "#12" atau kode aplikasi "GF-482". */
  displayNo: z.string(),
  channel: OrderChannel,
  type: OrderType,
  status: OrderStatus,
  paymentStatus: PaymentStatus,
  /** Metode yang dipilih pelanggan online (cash saat diantar / aba). */
  paymentMethod: PaymentMethod.nullable(),
  shiftId: Id.nullable(),
  tableSessionId: Id.nullable(),
  table: z.object({ id: Id, name: z.string() }).nullable(),
  customer: CustomerRef.nullable(),
  customerName: z.string().nullable(),
  address: AddressDto.nullable(),
  driver: UserRef.nullable(),
  items: z.array(OrderItemDto),
  subtotal: MoneyAmount,
  discount: MoneyAmount,
  promoId: Id.nullable(),
  deliveryFee: MoneyAmount,
  total: MoneyAmount,
  currency: Currency,
  note: z.string().nullable(),
  rejectReason: z.string().nullable(),
  cancelReason: z.string().nullable(),
  /** URL bukti bayar ABA terbaru (private; staf saja). */
  proofUrl: z.string().nullable(),
  payments: z.array(PaymentDto),
  /** Jumlah terbayar (mata uang utama). */
  paidMain: MoneyAmount,
  createdBy: UserRef.nullable(),
});
export type OrderDto = z.infer<typeof OrderDto>;

/** Order versi pelanggan (tanpa data internal). */
export const PublicOrderDto = OrderTimestamps.extend({
  id: Uuid,
  number: z.number().int(),
  displayNo: z.string(),
  channel: OrderChannel,
  type: OrderType,
  status: OrderStatus,
  paymentStatus: PaymentStatus,
  paymentMethod: PaymentMethod.nullable(),
  table: z.object({ id: Id, name: z.string() }).nullable(),
  address: AddressDto.nullable(),
  items: z.array(OrderItemDto),
  subtotal: MoneyAmount,
  discount: MoneyAmount,
  deliveryFee: MoneyAmount,
  total: MoneyAmount,
  currency: Currency,
  note: z.string().nullable(),
  rejectReason: z.string().nullable(),
  proofUploaded: z.boolean(),
  /** Nama driver (jika sudah diambil). */
  driverName: z.string().nullable(),
});
export type PublicOrderDto = z.infer<typeof PublicOrderDto>;

/** `GET /orders?status=&date=&since=` */
export const ListOrdersQuery = z.object({
  /** Satu atau beberapa status dipisah koma: `accepted,cooking`. */
  status: z
    .string()
    .optional()
    .transform((s) => (s ? s.split(',').map((x) => OrderStatus.parse(x.trim())) : undefined)),
  /** business_date; default = hari operasional berjalan. */
  date: Ymd.optional(),
  /** Hanya order yang berubah setelah waktu ini (sinkronisasi saat reconnect). */
  since: IsoDateTimeInput.optional(),
  channel: OrderChannel.optional(),
  type: OrderType.optional(),
  /** true = hanya status aktif (lintas tanggal). */
  active: QueryBool.optional(),
  tableSessionId: z.coerce.number().int().positive().optional(),
});
export type ListOrdersQuery = z.input<typeof ListOrdersQuery>;

export const ListOrdersResponse = z.object({
  orders: z.array(OrderDto),
  /** Waktu server saat respons dibuat — simpan sebagai `lastEventAt` berikutnya. */
  serverTime: IsoDateTime,
});
export type ListOrdersResponse = z.infer<typeof ListOrdersResponse>;

export const OrderResponse = z.object({ order: OrderDto });
export type OrderResponse = z.infer<typeof OrderResponse>;

/** `POST /orders/:id/accept` — body opsional. */
export const AcceptOrderRequest = z.object({ note: z.string().max(200).optional() }).default({});
export const RejectOrderRequest = z.object({ reason: z.string().trim().min(1).max(300) });
export type RejectOrderRequest = z.infer<typeof RejectOrderRequest>;
/** `POST /orders/:id/status` — transisi umum (dapur: cooking/ready; kasir: served/done). */
export const OrderStatusRequest = z.object({ status: OrderStatus });
export type OrderStatusRequest = z.infer<typeof OrderStatusRequest>;
/**
 * `POST /orders/:id/cancel`. Bila order sudah dibayar dan user tidak punya `order.cancel_paid`,
 * wajib `adminPin` (PIN user mana pun yang punya `order.cancel_paid`) → selain itu ADMIN_PIN_REQUIRED.
 */
export const CancelOrderRequest = z.object({
  reason: z.string().trim().min(1).max(300),
  adminPin: Pin.optional(),
});
export type CancelOrderRequest = z.infer<typeof CancelOrderRequest>;
