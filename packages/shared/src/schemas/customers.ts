import { z } from 'zod';
import { IsoDateTime, Lat, Lng } from './common';
import { AddressDto, CustomerRef } from './orders';

/** Alamat tersimpan pelanggan untuk kasir: + kapan terakhir dipakai order. */
export const StaffAddressDto = AddressDto.extend({ lastUsedAt: IsoDateTime.nullable() });
export type StaffAddressDto = z.infer<typeof StaffAddressDto>;

/** `GET /customers/search?q=` — cari nama / @username Telegram / no HP. */
export const CustomerSearchQuery = z.object({
  q: z.string().trim().min(1).max(100),
  limit: z.coerce.number().int().min(1).max(20).optional(),
});
export type CustomerSearchQuery = z.input<typeof CustomerSearchQuery>;

export const CustomerSearchItem = CustomerRef.extend({
  /** Alamat utama (terakhir dipakai / terbaru). */
  lastAddress: StaffAddressDto.nullable(),
  addressCount: z.number().int().nonnegative(),
  orderCount: z.number().int().nonnegative(),
  lastOrderAt: IsoDateTime.nullable(),
});
export type CustomerSearchItem = z.infer<typeof CustomerSearchItem>;

export const CustomerSearchResponse = z.object({ customers: z.array(CustomerSearchItem) });
export type CustomerSearchResponse = z.infer<typeof CustomerSearchResponse>;

/** `GET /customers/:id/addresses` — urut: terakhir dipakai dulu (pertama = alamat utama). */
export const CustomerAddressesResponse = z.object({
  customer: CustomerRef,
  addresses: z.array(StaffAddressDto),
});
export type CustomerAddressesResponse = z.infer<typeof CustomerAddressesResponse>;

export const CustomerAddressParams = z.object({
  id: z.coerce.number().int().positive(),
  addressId: z.coerce.number().int().positive(),
});
export type CustomerAddressParams = z.infer<typeof CustomerAddressParams>;

/** `POST /customers/:id/addresses` — titik opsional (alamat ketik manual tetap boleh). */
export const StaffCreateAddressRequest = z.object({
  label: z.string().trim().min(1).max(50).optional(),
  text: z.string().trim().min(1).max(300),
  landmark: z.string().trim().max(200).optional(),
  lat: Lat.optional(),
  lng: Lng.optional(),
});
export type StaffCreateAddressRequest = z.input<typeof StaffCreateAddressRequest>;

export const StaffUpdateAddressRequest = z.object({
  label: z.string().trim().min(1).max(50).optional(),
  text: z.string().trim().min(1).max(300).optional(),
  landmark: z.string().trim().max(200).nullable().optional(),
  lat: Lat.nullable().optional(),
  lng: Lng.nullable().optional(),
});
export type StaffUpdateAddressRequest = z.input<typeof StaffUpdateAddressRequest>;

export const StaffAddressResponse = z.object({ address: StaffAddressDto });
export type StaffAddressResponse = z.infer<typeof StaffAddressResponse>;

/** `POST /geo/resolve-link` — buka link pendek Google Maps (server mengikuti redirect, host dibatasi). */
export const ResolveLinkRequest = z.object({ url: z.string().trim().min(8).max(2000) });
export type ResolveLinkRequest = z.infer<typeof ResolveLinkRequest>;
export const ResolveLinkResponse = z.object({
  /** URL akhir setelah redirect. */
  url: z.string(),
  lat: Lat.nullable(),
  lng: Lng.nullable(),
});
export type ResolveLinkResponse = z.infer<typeof ResolveLinkResponse>;
