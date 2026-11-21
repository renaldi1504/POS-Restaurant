/**
 * `defineRoute` — daftarkan route Fastify langsung dari registri kontrak `@pos/shared` (`endpoints`).
 *
 *   defineRoute(app, 'orderGet', async ({ params, staff }) => {
 *     return { order: await getOrder(app.db, params.id) };   // ← tipe respons dicek TypeScript
 *   });
 *
 * Otomatis: method + path, guard auth (`staff` / `customer`) + permission dari kontrak, parse Zod
 * params/query/body (400 VALIDATION_ERROR), rate limit per endpoint, dan validasi respons terhadap
 * schema (respons di-strip ke bentuk kontrak; di dev/test ketidakcocokan = 500 supaya cepat ketahuan).
 * Endpoint `multipart`: body tidak diparse — pakai `await req.file()` di handler.
 * Endpoint `binary`: kirim sendiri via `reply.type(...).send(buf)` lalu `return reply`.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest, RouteShorthandOptions } from 'fastify';
import {
  endpoints,
  type EndpointDef,
  type EndpointKey,
  type EndpointResponse,
  type Endpoints,
  type ParsedBody,
  type ParsedParams,
  type ParsedQuery,
} from '@pos/shared';
import { AppError, validationError } from './errors';
import { assertPermission, requireCustomer, type CustomerContext, type StaffContext } from './session';

type AuthOf<K extends EndpointKey> = Endpoints[K]['auth'];

export interface RouteContext<K extends EndpointKey> {
  app: FastifyInstance;
  req: FastifyRequest;
  reply: FastifyReply;
  params: ParsedParams<K>;
  query: ParsedQuery<K>;
  body: ParsedBody<K>;
  /** Non-null untuk endpoint `auth: 'staff'`. */
  staff: AuthOf<K> extends 'staff' ? StaffContext : StaffContext | null;
  /** Non-null untuk endpoint `auth: 'customer'`. */
  customer: AuthOf<K> extends 'customer' ? CustomerContext : CustomerContext | null;
}

type HandlerResult<K extends EndpointKey> = Endpoints[K]['response'] extends 'binary'
  ? FastifyReply
  : EndpointResponse<K> | FastifyReply;

export type RouteHandler<K extends EndpointKey> = (ctx: RouteContext<K>) => Promise<HandlerResult<K>>;

export interface DefineRouteOptions {
  /** preHandler tambahan (dijalankan setelah guard kontrak). */
  preHandler?: RouteShorthandOptions['preHandler'];
  /** Status sukses (default 200). */
  status?: number;
}

function parseOrThrow(schema: EndpointDef['body'], value: unknown, where: string): unknown {
  if (!schema) return undefined;
  const r = schema.safeParse(value);
  if (!r.success) throw validationError(`Data ${where} tidak valid`, r.error.issues);
  return r.data;
}

/** Rate limit: nilai kontrak, atau default 120/menit untuk semua endpoint publik pelanggan. */
function rateLimitFor(def: EndpointDef) {
  const max = def.rateLimitPerMin ?? (def.path.startsWith('/api/public/') ? 120 : undefined);
  return max ? { rateLimit: { max, timeWindow: '1 minute' } } : {};
}

export function defineRoute<K extends EndpointKey>(
  app: FastifyInstance,
  key: K,
  handler: RouteHandler<K>,
  opts: DefineRouteOptions = {},
): void {
  const def: EndpointDef = endpoints[key];
  const strictResponses = !app.config.isProd;

  app.route({
    method: def.method,
    url: def.path,
    config: rateLimitFor(def),
    preHandler: opts.preHandler,
    handler: async (req, reply) => {
      let staff: StaffContext | null = req.staff;
      let customer: CustomerContext | null = req.customer;
      if (def.auth === 'staff') staff = assertPermission(req, ...(def.permission ?? []));
      if (def.auth === 'customer') customer = requireCustomer(req);

      const params = parseOrThrow(def.params, req.params, 'path');
      const query = parseOrThrow(def.query, req.query, 'query');
      const body = def.multipart ? undefined : parseOrThrow(def.body, req.body, 'body');

      const result = await handler({
        app,
        req,
        reply,
        params,
        query,
        body,
        staff,
        customer,
      } as RouteContext<K>);

      if (result === reply || reply.sent) return reply;
      if (def.response === 'binary') {
        throw new AppError(500, 'INTERNAL_ERROR', `Handler ${key} harus mengirim binary via reply`);
      }
      const checked = def.response.safeParse(result);
      if (!checked.success) {
        req.log.error({ key, issues: checked.error.issues }, 'Respons tidak sesuai kontrak');
        if (strictResponses) {
          throw new AppError(
            500,
            'INTERNAL_ERROR',
            `Respons ${key} tidak sesuai kontrak`,
            checked.error.issues,
          );
        }
        return reply.status(opts.status ?? 200).send(result);
      }
      return reply.status(opts.status ?? 200).send(checked.data);
    },
  });
}
