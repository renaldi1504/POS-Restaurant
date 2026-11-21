import { z } from 'zod';
import { Currency, PaymentMethod } from '../enums';
import { Id, MoneyAmount, PositiveMoney, Uuid } from './common';
import { OrderDto, PaymentDto } from './orders';
import { TableSessionDto } from './tables';

export const PaymentLineInput = z.object({
  method: PaymentMethod,
  currency: Currency,
  /** Uang diterima dalam `currency` (minor). Untuk cash boleh lebih → kembalian. */
  amount: PositiveMoney,
  proofUrl: z.string().max(500).optional(),
});
export type PaymentLineInput = z.infer<typeof PaymentLineInput>;

/**
 * `POST /payments` — bayar satu order ATAU satu sesi meja (salah satu).
 * Split = beberapa `lines` (mis. sebagian cash KHR + sebagian ABA) atau beberapa panggilan
 * (bagi rata / per item: klien menghitung bagian lalu membayar sebagian; sesi lunas bila sisa 0).
 */
export const CreatePaymentRequest = z
  .object({
    orderId: Uuid.optional(),
    tableSessionId: Id.optional(),
    lines: z.array(PaymentLineInput).min(1).max(10),
    /** true = boleh bayar sebagian (split bill). false = total harus tercapai (PAYMENT_INSUFFICIENT). */
    partial: z.boolean().default(false),
  })
  .refine((v) => (v.orderId ? 1 : 0) + (v.tableSessionId ? 1 : 0) === 1, {
    message: 'Isi orderId atau tableSessionId (salah satu)',
    path: ['orderId'],
  });
export type CreatePaymentRequest = z.input<typeof CreatePaymentRequest>;

export const CreatePaymentResponse = z.object({
  payments: z.array(PaymentDto),
  /** Total diterima (mata uang utama). */
  paidMain: MoneyAmount,
  /** Kembalian (mata uang utama). */
  changeMain: MoneyAmount,
  /** Sisa yang belum dibayar (0 = lunas). */
  remainingMain: MoneyAmount,
  order: OrderDto.nullable(),
  session: TableSessionDto.nullable(),
});
export type CreatePaymentResponse = z.infer<typeof CreatePaymentResponse>;

/** `POST /payments/:id/verify` — verifikasi bukti ABA. */
export const VerifyPaymentRequest = z.object({
  approved: z.boolean(),
  note: z.string().max(300).optional(),
});
export type VerifyPaymentRequest = z.infer<typeof VerifyPaymentRequest>;
export const VerifyPaymentResponse = z.object({ payment: PaymentDto, order: OrderDto.nullable() });
export type VerifyPaymentResponse = z.infer<typeof VerifyPaymentResponse>;
