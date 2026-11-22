import type { FastifyInstance } from 'fastify';
import { defineRoute } from '../../lib/route';
import { resolveMapsLink } from './resolveLink';
import { reverseGeocode } from './service';

export default async function geoRoutes(app: FastifyInstance) {
  defineRoute(app, 'publicReverseGeocode', async ({ query }) =>
    reverseGeocode(app, query.lat, query.lng, query.lang ?? 'id'),
  );

  defineRoute(app, 'geoResolveLink', async ({ body }) => resolveMapsLink(body.url));
}
