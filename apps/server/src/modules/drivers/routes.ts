import type { FastifyInstance } from 'fastify';

/**
 * Modul drivers — daftarkan endpoint dengan `defineRoute(app, '<endpointKey>', handler)`
 * (lihat packages/shared/src/api.ts untuk daftar key, schema & permission).
 */
export default async function driversRoutes(_app: FastifyInstance) {
  // contoh: defineRoute(app, 'menuStaff', async () => ({ ... }));
}
