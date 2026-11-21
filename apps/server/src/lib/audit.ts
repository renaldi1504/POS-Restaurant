import type { DbOrTx } from '../db/client';
import { auditLogs } from '../db/schema';

export interface AuditEntry {
  userId: number | null;
  /** Mis. 'order.cancel', 'order.status', 'menu.update', 'settings.update', 'auth.login'. */
  action: string;
  entity: string;
  entityId?: string | number | null;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
}

/** Tulis audit log (panggil di dalam transaksi yang sama dengan perubahan bila memungkinkan). */
export async function writeAudit(db: DbOrTx, e: AuditEntry): Promise<void> {
  await db.insert(auditLogs).values({
    userId: e.userId,
    action: e.action,
    entity: e.entity,
    entityId: e.entityId == null ? null : String(e.entityId),
    before: e.before ?? null,
    after: e.after ?? null,
    reason: e.reason ?? null,
  });
}
