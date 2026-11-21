import { and, eq, isNull } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { hasPermission } from '@pos/shared';
import { orders, roles, users } from '../../db/schema';
import { writeAudit } from '../../lib/audit';
import { now } from '../../lib/clock';
import { conflict, forbidden, notFound, unprocessable, validationError } from '../../lib/errors';
import { defineRoute } from '../../lib/route';
import type { StaffContext } from '../../lib/session';
import { getSettings } from '../../lib/settings';
import { getOrderDto } from '../orders/dto';
import { afterOrderChange, applyTransition, lockOrder, transitionOrder } from '../orders/service';
import { orderPaidMain, payOrder, planLines } from '../payments/service';
import { availableOrders, myOrders, PLATFORM_CHANNELS, toDriverOrder } from './service';

export default async function driversRoutes(app: FastifyInstance) {
  const asDriverOrder = async (id: string) =>
    toDriverOrder(await getOrderDto(app.db, id), await getSettings(app.db));
  const isAdmin = (s: StaffContext) => hasPermission(s.permissions, 'settings.manage');

  defineRoute(app, 'driverAvailable', async () => ({
    orders: await availableOrders(app.db, await getSettings(app.db)),
  }));

  defineRoute(app, 'driverMine', async ({ staff }) => myOrders(app.db, staff.id, await getSettings(app.db)));

  defineRoute(app, 'driverTake', async ({ params, staff }) => {
    const [taken] = await app.db
      .update(orders)
      .set({ driverId: staff.id, updatedAt: now() })
      .where(
        and(
          eq(orders.id, params.id),
          isNull(orders.driverId),
          eq(orders.status, 'ready'),
          eq(orders.type, 'delivery'),
        ),
      )
      .returning({ id: orders.id, channel: orders.channel });
    if (!taken) {
      const [o] = await app.db.select().from(orders).where(eq(orders.id, params.id));
      if (!o || o.type !== 'delivery') throw notFound('Order tidak ditemukan');
      if (o.driverId) throw conflict('ALREADY_TAKEN', 'Order sudah diambil driver lain');
      throw unprocessable('INVALID_TRANSITION', 'Order belum siap diantar');
    }
    if ((PLATFORM_CHANNELS as readonly string[]).includes(taken.channel)) {
      await app.db.update(orders).set({ driverId: null }).where(eq(orders.id, params.id));
      throw unprocessable('BAD_REQUEST', 'Order Grab/foodpanda diantar kurir aplikasi');
    }
    await writeAudit(app.db, {
      userId: staff.id,
      action: 'driver.take',
      entity: 'order',
      entityId: params.id,
    });
    await afterOrderChange(app, params.id, { notify: false });
    return { order: await asDriverOrder(params.id) };
  });

  const assertMine = (staff: StaffContext) => (row: { driverId: number | null }) => {
    if (row.driverId !== staff.id) throw forbidden('Order ini bukan antaran Anda');
  };

  defineRoute(app, 'driverPicked', async ({ params, staff }) => {
    await transitionOrder(app, params.id, 'picked_up', staff.id, { guard: assertMine(staff) });
    return { order: await asDriverOrder(params.id) };
  });

  defineRoute(app, 'driverDelivered', async ({ params, body, staff }) => {
    const settings = await getSettings(app.db);
    const collected = body?.collected;
    if (collected) {
      // Cek dulu jumlah cukup sebelum status diubah.
      const [row] = await app.db.select().from(orders).where(eq(orders.id, params.id));
      if (!row) throw notFound('Order tidak ditemukan');
      const due = Math.max(0, row.total - (await orderPaidMain(app.db, params.id)));
      if (due > 0)
        planLines(
          [{ method: 'cash', currency: collected.currency, amount: collected.amount }],
          due,
          settings,
          false,
        );
    }
    const dto = await transitionOrder(app, params.id, 'delivered', staff.id, { guard: assertMine(staff) });
    if (collected && dto.paymentStatus !== 'paid' && dto.total - dto.paidMain > 0) {
      await payOrder(
        app,
        params.id,
        [{ method: 'cash', currency: collected.currency, amount: collected.amount }],
        {
          partial: false,
          staff,
          requireShift: false,
        },
      );
    } else if (dto.paymentStatus === 'paid') {
      await transitionOrder(app, params.id, 'done', staff.id, { reason: 'lunas' });
    }
    return { order: await asDriverOrder(params.id) };
  });

  defineRoute(app, 'driverRelease', async ({ params, body, staff }) => {
    const admin = isAdmin(staff);
    if (body?.toDriverId !== undefined && !admin) throw forbidden('Hanya admin yang bisa memindah order');
    if (body?.toDriverId) {
      const [d] = await app.db
        .select({ id: users.id, active: users.active, permissions: roles.permissions })
        .from(users)
        .innerJoin(roles, eq(roles.id, users.roleId))
        .where(eq(users.id, body.toDriverId));
      if (!d || !d.active || !(d.permissions ?? []).includes('driver.deliver'))
        throw validationError('Driver tujuan tidak valid', [{ path: ['toDriverId'] }]);
    }
    const prev = await app.db.transaction(async (tx) => {
      const row = await lockOrder(tx, params.id);
      if (!row.driverId) throw unprocessable('BAD_REQUEST', 'Order belum diambil driver');
      if (row.driverId !== staff.id && !admin) throw forbidden('Order ini bukan antaran Anda');
      if (!['ready', 'picked_up'].includes(row.status))
        throw unprocessable('INVALID_TRANSITION', 'Order sudah diantar, tidak bisa dilepas');
      const nextDriver = body?.toDriverId ?? null;
      if (row.status === 'picked_up' && !nextDriver) {
        await applyTransition(tx, row, 'ready', staff.id, {
          reason: body?.reason ?? null,
          auditAction: 'driver.release',
          set: { driverId: null },
        });
      } else {
        await tx.update(orders).set({ driverId: nextDriver, updatedAt: now() }).where(eq(orders.id, row.id));
        await writeAudit(tx, {
          userId: staff.id,
          action: nextDriver ? 'driver.reassign' : 'driver.release',
          entity: 'order',
          entityId: row.id,
          before: { driverId: row.driverId },
          after: { driverId: nextDriver },
          reason: body?.reason ?? null,
        });
      }
      return row.status;
    });
    // prevStatus dibuat ≠ ready supaya order.ready_for_pickup dikirim lagi ke semua driver bila dilepas.
    await afterOrderChange(app, params.id, {
      prevStatus: prev === 'ready' ? 'picked_up' : prev,
      notify: false,
    });
    return { order: await asDriverOrder(params.id) };
  });
}
