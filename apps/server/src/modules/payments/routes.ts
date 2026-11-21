import type { FastifyInstance } from 'fastify';

/**
 * Modul payments — daftarkan endpoint dengan `defineRoute(app, '<endpointKey>', handler)`
 * (lihat packages/shared/src/api.ts untuk daftar key, schema & permission).
 */
export default async function paymentsRoutes(_app: FastifyInstance) {
  // contoh: defineRoute(app, 'menuStaff', async () => ({ ... }));
}
