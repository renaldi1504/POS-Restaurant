/** Chat driver ↔ pelanggan (relay lewat bot Telegram) per order. */
import { z } from 'zod';
import { Lang } from '../enums';
import { Id, IsoDateTime } from './common';

export const CHAT_TEMPLATES = ['on_the_way', 'arrived', 'send_location', 'wait', 'thanks'] as const;
export const ChatTemplate = z.enum(CHAT_TEMPLATES);
export type ChatTemplate = z.infer<typeof ChatTemplate>;

export const OrderMessageDto = z.object({
  id: Id,
  orderId: z.string().uuid(),
  /** out = staf → pelanggan, in = pelanggan → staf. */
  direction: z.enum(['out', 'in']),
  kind: z.enum(['text', 'photo', 'location']),
  text: z.string().nullable(),
  template: ChatTemplate.nullable(),
  photoUrl: z.string().nullable(),
  lat: z.number().nullable(),
  lng: z.number().nullable(),
  staff: z.object({ id: Id, name: z.string() }).nullable(),
  createdAt: IsoDateTime,
});
export type OrderMessageDto = z.infer<typeof OrderMessageDto>;

export const OrderMessagesResponse = z.object({
  messages: z.array(OrderMessageDto),
  /** Pelanggan memakai Telegram → chat bisa dikirim. */
  canChat: z.boolean(),
  customerLang: Lang,
});
export type OrderMessagesResponse = z.infer<typeof OrderMessagesResponse>;

export const SendOrderMessageRequest = z
  .object({
    text: z.string().trim().min(1).max(1000).optional(),
    template: ChatTemplate.optional(),
  })
  .refine((v) => !!v.text || !!v.template, { message: 'Pesan kosong', path: ['text'] });
export type SendOrderMessageRequest = z.infer<typeof SendOrderMessageRequest>;

export const OrderMessageResponse = z.object({ message: OrderMessageDto });
export type OrderMessageResponse = z.infer<typeof OrderMessageResponse>;

/** Realtime staf: pesan baru (masuk/keluar) di chat order. */
export const OrderMessagePayload = z.object({ message: OrderMessageDto, at: IsoDateTime });
export type OrderMessagePayload = z.infer<typeof OrderMessagePayload>;
