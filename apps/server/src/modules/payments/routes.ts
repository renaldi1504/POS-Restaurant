import type { FastifyInstance } from 'fastify';
import { defineRoute } from '../../lib/route';
import { payOrder, paySession, verifyPayment } from './service';

export default async function paymentsRoutes(app: FastifyInstance) {
  defineRoute(app, 'paymentCreate', async ({ body, staff }) => {
    if (body.orderId)
      return payOrder(app, body.orderId, body.lines, { partial: body.partial, staff, requireShift: true });
    return paySession(app, body.tableSessionId!, body.lines, { partial: body.partial, staff });
  });

  defineRoute(app, 'paymentVerify', async ({ params, body, staff }) =>
    verifyPayment(app, params.id, staff, body.approved, body.note),
  );
}
