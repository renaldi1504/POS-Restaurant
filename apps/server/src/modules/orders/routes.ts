import { and, eq, gt, inArray, type SQL } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { ACTIVE_ORDER_STATUSES, hasPermission, type OrderStatus } from '@pos/shared';
import { orders } from '../../db/schema';
import { currentBusinessDate } from '../../lib/business';
import { now } from '../../lib/clock';
import { forbidden, unprocessable } from '../../lib/errors';
import { defineRoute } from '../../lib/route';
import { getSettings } from '../../lib/settings';
import { getOrderDto, loadOrderDtos } from './dto';
import { acceptOrder, cancelOrder, createOrder, rejectOrder, transitionOrder, updateOrder } from './service';

/** Status yang boleh lewat endpoint umum `/status` (terima/tolak/batal punya endpoint sendiri). */
const KITCHEN_TARGETS: OrderStatus[] = ['cooking', 'ready'];
const GENERIC_FORBIDDEN: OrderStatus[] = ['pending_accept', 'accepted', 'rejected', 'cancelled'];

export default async function ordersRoutes(app: FastifyInstance) {
  defineRoute(app, 'ordersList', async ({ query }) => {
    const serverTime = now().toISOString();
    const conds: SQL[] = [];
    if (query.status?.length) conds.push(inArray(orders.status, query.status));
    if (query.channel) conds.push(eq(orders.channel, query.channel));
    if (query.type) conds.push(eq(orders.type, query.type));
    if (query.active) conds.push(inArray(orders.status, [...ACTIVE_ORDER_STATUSES]));
    if (query.tableSessionId) conds.push(eq(orders.tableSessionId, query.tableSessionId));
    if (query.since) conds.push(gt(orders.updatedAt, new Date(query.since)));
    const crossDate = query.active || query.since || query.tableSessionId;
    if (query.date || !crossDate) {
      const date = query.date ?? currentBusinessDate(await getSettings(app.db));
      conds.push(eq(orders.businessDate, date));
    }
    const list = await loadOrderDtos(app.db, and(...conds));
    return { orders: list, serverTime };
  });

  defineRoute(app, 'orderGet', async ({ params, staff }) => {
    const order = await getOrderDto(app.db, params.id);
    const isDriverOnly =
      hasPermission(staff.permissions, 'driver.deliver') &&
      !['order.create', 'order.accept', 'kitchen.view'].some((p) => staff.permissions.includes(p as never));
    if (isDriverOnly && order.type !== 'delivery')
      throw forbidden('Driver hanya bisa melihat order delivery');
    return { order };
  });

  defineRoute(app, 'orderCreate', async ({ body, staff }) => {
    if (body.type === 'delivery' && body.channel === 'kasir' && !body.delivery)
      throw unprocessable('VALIDATION_ERROR', 'Alamat delivery wajib diisi', [{ path: ['delivery'] }]);
    const order = await createOrder(app, {
      channel: body.channel,
      type: body.type,
      items: body.items,
      tableId: body.tableId,
      customerName: body.customerName ?? body.delivery?.name ?? null,
      delivery: body.delivery,
      deliveryFee: body.deliveryFee,
      promoId: body.promoId,
      discount: body.discount,
      note: body.note,
      displayNo: body.displayNo,
      createdBy: staff.id,
      requireShift: true,
      enforceMinOrder: false,
    });
    return { order };
  });

  defineRoute(app, 'orderUpdate', async ({ params, body, staff }) => ({
    order: await updateOrder(app, params.id, staff, body),
  }));

  defineRoute(app, 'orderAccept', async ({ params, body, staff }) => ({
    order: await acceptOrder(app, params.id, staff, body?.note),
  }));

  defineRoute(app, 'orderReject', async ({ params, body, staff }) => ({
    order: await rejectOrder(app, params.id, staff, body.reason),
  }));

  defineRoute(app, 'orderStatus', async ({ params, body, staff }) => {
    const to = body.status;
    if (GENERIC_FORBIDDEN.includes(to))
      throw unprocessable('INVALID_TRANSITION', 'Pakai tombol Terima/Tolak/Batal untuk status ini');
    const canAll = hasPermission(staff.permissions, 'order.create');
    if (!canAll && !KITCHEN_TARGETS.includes(to)) throw forbidden('Dapur hanya bisa Mulai masak / Siap');
    return {
      order: await transitionOrder(app, params.id, to, staff.id, {
        guard: (row) => {
          if (to === 'picked_up' && row.driverId && row.driverId !== staff.id)
            throw unprocessable('ALREADY_TAKEN', 'Order sudah diambil driver lain');
        },
      }),
    };
  });

  defineRoute(app, 'orderCancel', async ({ params, body, staff }) => ({
    order: await cancelOrder(app, params.id, staff, body),
  }));
}
