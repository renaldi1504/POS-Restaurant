import type { FastifyInstance } from 'fastify';

/**
 * Modul ai — daftarkan endpoint dengan `defineRoute(app, '<endpointKey>', handler)`
 * (lihat packages/shared/src/api.ts untuk daftar key, schema & permission).
 */
export default async function aiRoutes(_app: FastifyInstance) {
  // contoh: defineRoute(app, 'menuStaff', async () => ({ ... }));
}
