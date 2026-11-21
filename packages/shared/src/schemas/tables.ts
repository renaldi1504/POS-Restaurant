import { z } from 'zod';
import { Currency, TableSessionStatus, TableStatus } from '../enums';
import { Id, IsoDateTime, MoneyAmount, QueryIdList } from './common';
import { OrderDto } from './orders';

export const TableDto = z.object({
  id: Id,
  name: z.string(),
  area: z.string(),
  seats: z.number().int().nonnegative(),
  active: z.boolean(),
});
export type TableDto = z.infer<typeof TableDto>;

export const TableSessionDto = z.object({
  id: Id,
  tableId: Id,
  status: TableSessionStatus,
  openedAt: IsoDateTime,
  closedAt: IsoDateTime.nullable(),
});
export type TableSessionDto = z.infer<typeof TableSessionDto>;

/** Kartu meja di denah kasir (`GET /tables`). */
export const TableStatusDto = TableDto.extend({
  status: TableStatus,
  session: TableSessionDto.nullable(),
  /** Total berjalan (mata uang utama). */
  runningTotal: MoneyAmount,
  /** Jumlah order QR yang menunggu diterima. */
  pendingQrCount: z.number().int().nonnegative(),
  orderCount: z.number().int().nonnegative(),
});
export type TableStatusDto = z.infer<typeof TableStatusDto>;

export const TablesResponse = z.object({ tables: z.array(TableStatusDto) });
export type TablesResponse = z.infer<typeof TablesResponse>;

/** Tagihan meja (`GET /tables/:id/session`): ronde-ronde pesanan + total. */
export const TableBillDto = z.object({
  table: TableDto,
  session: TableSessionDto.nullable(),
  /** Urut waktu dibuat — tiap order = satu ronde. */
  orders: z.array(OrderDto),
  subtotal: MoneyAmount,
  discount: MoneyAmount,
  total: MoneyAmount,
  paid: MoneyAmount,
  remaining: MoneyAmount,
  currency: Currency,
});
export type TableBillDto = z.infer<typeof TableBillDto>;

export const TableSessionResponse = z.object({ session: TableSessionDto });
export type TableSessionResponse = z.infer<typeof TableSessionResponse>;

export const MoveTableRequest = z.object({ toTableId: Id });
export type MoveTableRequest = z.infer<typeof MoveTableRequest>;
export const MergeTablesRequest = z
  .object({ fromTableId: Id, toTableId: Id })
  .refine((v) => v.fromTableId !== v.toTableId, { message: 'Meja harus berbeda', path: ['toTableId'] });
export type MergeTablesRequest = z.infer<typeof MergeTablesRequest>;

/** Admin: meja beserta QR. */
export const AdminTableDto = TableDto.extend({
  qrToken: z.string(),
  /** `${ORDER_ORIGIN}/m/<qr_token>` */
  qrUrl: z.string(),
});
export type AdminTableDto = z.infer<typeof AdminTableDto>;
export const AdminTablesResponse = z.object({ tables: z.array(AdminTableDto) });
export type AdminTablesResponse = z.infer<typeof AdminTablesResponse>;
export const AdminTableResponse = z.object({ table: AdminTableDto });
export type AdminTableResponse = z.infer<typeof AdminTableResponse>;

export const CreateTableRequest = z.object({
  name: z.string().trim().min(1).max(50),
  area: z.string().trim().max(50).default('Dalam'),
  seats: z.number().int().min(0).max(50).default(4),
  active: z.boolean().default(true),
});
export type CreateTableRequest = z.input<typeof CreateTableRequest>;
export const UpdateTableRequest = z.object({
  name: z.string().trim().min(1).max(50).optional(),
  area: z.string().trim().max(50).optional(),
  seats: z.number().int().min(0).max(50).optional(),
  active: z.boolean().optional(),
});
export type UpdateTableRequest = z.infer<typeof UpdateTableRequest>;

/** `GET /admin/tables/qr.pdf?ids=1,2` — tanpa ids = semua meja aktif. Respons: application/pdf. */
export const TablesQrPdfQuery = z.object({ ids: QueryIdList.optional() });
