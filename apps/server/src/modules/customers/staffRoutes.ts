import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { addresses } from '../../db/schema';
import { writeAudit } from '../../lib/audit';
import { defineRoute } from '../../lib/route';
import {
  addressesByCustomer,
  requireCustomer,
  requireCustomerAddress,
  saveCustomerAddress,
  searchCustomers,
  toCustomerRef,
  toStaffAddressDto,
} from './staffService';

/** Endpoint kasir: cari pelanggan & kelola alamat tersimpan (order delivery / Telegram). */
export default async function customerStaffRoutes(app: FastifyInstance) {
  defineRoute(app, 'customersSearch', async ({ query }) => ({
    customers: await searchCustomers(app.db, query.q, query.limit ?? 20),
  }));

  defineRoute(app, 'customerAddresses', async ({ params }) => {
    const c = await requireCustomer(app.db, params.id);
    const map = await addressesByCustomer(app.db, [c.id]);
    return { customer: toCustomerRef(c), addresses: map.get(c.id) ?? [] };
  });

  defineRoute(app, 'customerAddressCreate', async ({ params, body, staff }) => {
    const c = await requireCustomer(app.db, params.id);
    const row = await saveCustomerAddress(app.db, c.id, body);
    await writeAudit(app.db, {
      userId: staff.id,
      action: 'customer.address_create',
      entity: 'address',
      entityId: row.id,
      after: { customerId: c.id, text: row.text, lat: row.lat, lng: row.lng },
    });
    return { address: toStaffAddressDto(row) };
  });

  defineRoute(app, 'customerAddressUpdate', async ({ params, body, staff }) => {
    const before = await requireCustomerAddress(app.db, params.id, params.addressId);
    const set: Partial<typeof addresses.$inferInsert> = {};
    if (body.label !== undefined) set.label = body.label;
    if (body.text !== undefined) set.text = body.text;
    if (body.landmark !== undefined) set.landmark = body.landmark || null;
    if (body.lat !== undefined) set.lat = body.lat;
    if (body.lng !== undefined) set.lng = body.lng;
    if (!Object.keys(set).length) return { address: toStaffAddressDto(before) };
    const [row] = await app.db.update(addresses).set(set).where(eq(addresses.id, before.id)).returning();
    await writeAudit(app.db, {
      userId: staff.id,
      action: 'customer.address_update',
      entity: 'address',
      entityId: before.id,
      before: { text: before.text, landmark: before.landmark, lat: before.lat, lng: before.lng },
      after: set,
    });
    return { address: toStaffAddressDto(row!) };
  });
}
