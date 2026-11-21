import type { FastifyInstance } from 'fastify';

/**
 * Modul telegram — daftarkan endpoint dengan `defineRoute(app, '<endpointKey>', handler)`
 * (lihat packages/shared/src/api.ts untuk daftar key, schema & permission).
 */
export default async function telegramRoutes(_app: FastifyInstance) {
  // contoh: defineRoute(app, 'menuStaff', async () => ({ ... }));
}
