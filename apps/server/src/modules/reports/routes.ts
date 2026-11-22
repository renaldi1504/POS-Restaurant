import { and, desc, eq, gte, lt, lte, type SQL } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { auditLogs, users } from '../../db/schema';
import { currentBusinessDate } from '../../lib/business';
import { defineRoute } from '../../lib/route';
import { getSettings } from '../../lib/settings';
import { computePreview, getClosingDto } from '../closing/service';
import { getShift, toShiftDto } from '../shifts/service';
import { unprocessable } from '../../lib/errors';
import { dailyReport, rangeReport } from './service';

export default async function reportsRoutes(app: FastifyInstance) {
  defineRoute(app, 'reportsDaily', async ({ query }) => {
    const settings = await getSettings(app.db);
    return dailyReport(app.db, query.date ?? currentBusinessDate(settings), settings);
  });

  defineRoute(app, 'reportsRange', async ({ query }) => {
    const settings = await getSettings(app.db);
    try {
      return await rangeReport(app.db, query.from, query.to, settings);
    } catch (err) {
      if ((err as Error).message === 'RANGE_TOO_LONG')
        throw unprocessable('VALIDATION_ERROR', 'Rentang tanggal maksimal 400 hari');
      throw err;
    }
  });

  defineRoute(app, 'reportsClosing', async ({ params }) => {
    const shift = await getShift(app.db, params.shiftId);
    const settings = await getSettings(app.db);
    return {
      shift: await toShiftDto(app.db, shift),
      closing: await getClosingDto(app.db, shift.id),
      preview: await computePreview(app.db, shift, settings),
    };
  });

  defineRoute(app, 'auditLogs', async ({ query }) => {
    const conds: SQL[] = [];
    if (query.entity) conds.push(eq(auditLogs.entity, query.entity));
    if (query.entityId) conds.push(eq(auditLogs.entityId, query.entityId));
    if (query.userId) conds.push(eq(auditLogs.userId, query.userId));
    if (query.action) conds.push(eq(auditLogs.action, query.action));
    if (query.from) conds.push(gte(auditLogs.createdAt, new Date(query.from)));
    if (query.to) conds.push(lte(auditLogs.createdAt, new Date(query.to)));
    if (query.before) conds.push(lt(auditLogs.id, query.before));
    const rows = await app.db
      .select({ log: auditLogs, userName: users.name })
      .from(auditLogs)
      .leftJoin(users, eq(users.id, auditLogs.userId))
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(desc(auditLogs.id))
      .limit(query.limit + 1);
    const page = rows.slice(0, query.limit);
    return {
      logs: page.map(({ log, userName }) => ({
        id: log.id,
        user: log.userId ? { id: log.userId, name: userName ?? '?' } : null,
        action: log.action,
        entity: log.entity,
        entityId: log.entityId,
        before: log.before ?? null,
        after: log.after ?? null,
        reason: log.reason,
        createdAt: log.createdAt.toISOString(),
      })),
      nextCursor: rows.length > query.limit ? page[page.length - 1]!.log.id : null,
    };
  });
}
