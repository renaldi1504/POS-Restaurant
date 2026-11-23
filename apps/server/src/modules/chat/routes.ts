import type { FastifyInstance } from 'fastify';
import { defineRoute } from '../../lib/route';
import { readImageUpload } from '../../lib/upload';
import { listMessages, sendPhoto, sendText } from './service';

export default async function chatRoutes(app: FastifyInstance) {
  defineRoute(app, 'orderMessages', async ({ params, staff }) => listMessages(app, params.id, staff));

  defineRoute(app, 'orderMessageSend', async ({ params, body, staff }) => ({
    message: await sendText(app, staff, params.id, body),
  }));

  defineRoute(app, 'orderMessagePhoto', async ({ params, req, staff }) => {
    const file = await readImageUpload(req);
    return { message: await sendPhoto(app, staff, params.id, file) };
  });
}
