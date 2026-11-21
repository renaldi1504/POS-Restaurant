import { asc, count, eq, inArray } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { dineTables, orders, tableSessions } from '../../db/schema';
import { newQrToken } from '../../db/seed-data';
import { writeAudit } from '../../lib/audit';
import { now } from '../../lib/clock';
import { notFound } from '../../lib/errors';
import { defineRoute } from '../../lib/route';
import { getSettings } from '../../lib/settings';
import { loadOrderDtos } from '../orders/dto';
import { emitOrderEvent } from '../orders/events';
import { localLogoPath, renderTablesQrPdf } from './pdf';
import {
  emitTableUpdated,
  getOrOpenSession,
  getTable,
  listTableStatuses,
  mergeTables,
  moveTable,
  tableBillDto,
  toAdminTableDto,
  toSessionDto,
} from './service';

export default async function tablesRoutes(app: FastifyInstance) {
  const origin = () => app.config.ORDER_ORIGIN;

  defineRoute(app, 'tablesList', async () => ({ tables: await listTableStatuses(app.db) }));

  defineRoute(app, 'tableSession', async ({ params }) => tableBillDto(app.db, params.id));

  defineRoute(app, 'tableOpen', async ({ params, staff }) => {
    const r = await app.db.transaction(async (tx) => {
      const r = await getOrOpenSession(tx, params.id, now());
      if (r.opened)
        await writeAudit(tx, {
          userId: staff.id,
          action: 'table.open',
          entity: 'table_session',
          entityId: r.session.id,
          after: { tableId: params.id },
        });
      return r;
    });
    if (r.opened) app.realtime.attachTableSession(params.id, r.session.id);
    await emitTableUpdated(app, params.id);
    return { session: toSessionDto(r.session) };
  });

  defineRoute(app, 'tableMove', async ({ params, body, staff }) => {
    const session = await app.db.transaction(async (tx) => {
      const s = await moveTable(tx, params.id, body.toTableId);
      await writeAudit(tx, {
        userId: staff.id,
        action: 'table.move',
        entity: 'table_session',
        entityId: s.id,
        before: { tableId: params.id },
        after: { tableId: body.toTableId },
      });
      return s;
    });
    app.realtime.attachTableSession(body.toTableId, session.id);
    await emitTableUpdated(app, params.id);
    await emitTableUpdated(app, body.toTableId);
    const moved = await loadOrderDtos(app.db, eq(orders.tableSessionId, session.id));
    for (const o of moved) emitOrderEvent(app, 'order.updated', o);
    return { session: toSessionDto(session) };
  });

  defineRoute(app, 'tablesMerge', async ({ body, staff }) => {
    const r = await app.db.transaction(async (tx) => {
      const r = await mergeTables(tx, body.fromTableId, body.toTableId);
      await writeAudit(tx, {
        userId: staff.id,
        action: 'table.merge',
        entity: 'table_session',
        entityId: r.target.id,
        before: { fromTableId: body.fromTableId, fromSessionId: r.fromSessionId },
        after: { toTableId: body.toTableId, sessionId: r.target.id },
      });
      return r;
    });
    app.realtime.attachTableSession(body.toTableId, r.target.id);
    app.realtime.attachTableSession(body.fromTableId, r.target.id);
    await emitTableUpdated(app, body.fromTableId, r.fromSessionId);
    await emitTableUpdated(app, body.toTableId);
    const moved = await loadOrderDtos(app.db, eq(orders.tableSessionId, r.target.id));
    for (const o of moved) emitOrderEvent(app, 'order.updated', o);
    return { session: toSessionDto(r.target) };
  });

  // ---------- Admin ----------
  defineRoute(app, 'adminTablesList', async () => {
    const rows = await app.db.select().from(dineTables).orderBy(asc(dineTables.sort), asc(dineTables.id));
    return { tables: rows.map((t) => toAdminTableDto(t, origin())) };
  });

  defineRoute(app, 'adminTableCreate', async ({ body, staff }) => {
    const [{ n } = { n: 0 }] = await app.db.select({ n: count() }).from(dineTables);
    const [row] = await app.db
      .insert(dineTables)
      .values({
        name: body.name,
        area: body.area,
        seats: body.seats,
        active: body.active,
        qrToken: newQrToken(),
        sort: n,
      })
      .returning();
    await writeAudit(app.db, {
      userId: staff.id,
      action: 'table.create',
      entity: 'table',
      entityId: row!.id,
      after: body,
    });
    return { table: toAdminTableDto(row!, origin()) };
  });

  defineRoute(app, 'adminTableUpdate', async ({ params, body, staff }) => {
    const before = await getTable(app.db, params.id);
    const set: Partial<typeof dineTables.$inferInsert> = {};
    if (body.name !== undefined) set.name = body.name;
    if (body.area !== undefined) set.area = body.area;
    if (body.seats !== undefined) set.seats = body.seats;
    if (body.active !== undefined) set.active = body.active;
    const [row] = Object.keys(set).length
      ? await app.db.update(dineTables).set(set).where(eq(dineTables.id, params.id)).returning()
      : [before];
    await writeAudit(app.db, {
      userId: staff.id,
      action: 'table.update',
      entity: 'table',
      entityId: params.id,
      before,
      after: row,
    });
    return { table: toAdminTableDto(row!, origin()) };
  });

  defineRoute(app, 'adminTableDelete', async ({ params, staff }) => {
    const before = await getTable(app.db, params.id);
    const [{ n } = { n: 0 }] = await app.db
      .select({ n: count() })
      .from(tableSessions)
      .where(eq(tableSessions.tableId, params.id));
    // Meja yang punya riwayat sesi: nonaktifkan + token baru (QR lama mati).
    if (n > 0)
      await app.db
        .update(dineTables)
        .set({ active: false, qrToken: newQrToken() })
        .where(eq(dineTables.id, params.id));
    else await app.db.delete(dineTables).where(eq(dineTables.id, params.id));
    await writeAudit(app.db, {
      userId: staff.id,
      action: 'table.delete',
      entity: 'table',
      entityId: params.id,
      before,
    });
    return { ok: true as const };
  });

  defineRoute(app, 'adminTableRegenerateQr', async ({ params, staff }) => {
    await getTable(app.db, params.id);
    const [row] = await app.db
      .update(dineTables)
      .set({ qrToken: newQrToken() })
      .where(eq(dineTables.id, params.id))
      .returning();
    await writeAudit(app.db, {
      userId: staff.id,
      action: 'table.regenerate_qr',
      entity: 'table',
      entityId: params.id,
    });
    return { table: toAdminTableDto(row!, origin()) };
  });

  defineRoute(app, 'adminTablesQrPdf', async ({ query, reply }) => {
    const rows = await app.db
      .select()
      .from(dineTables)
      .where(query.ids ? inArray(dineTables.id, query.ids) : eq(dineTables.active, true))
      .orderBy(asc(dineTables.sort), asc(dineTables.id));
    if (query.ids && !rows.length) throw notFound('Meja tidak ditemukan');
    const settings = await getSettings(app.db);
    const pdf = await renderTablesQrPdf(
      rows.map((t) => ({ tableName: t.name, area: t.area, url: toAdminTableDto(t, origin()).qrUrl })),
      {
        restaurantName: settings.profile.name,
        logoPath: localLogoPath(settings.profile.logoUrl, app.config.UPLOAD_DIR),
      },
    );
    return reply
      .type('application/pdf')
      .header('Content-Disposition', 'inline; filename="qr-meja.pdf"')
      .send(pdf);
  });
}
