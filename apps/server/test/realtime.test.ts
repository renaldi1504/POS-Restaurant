import type { AddressInfo } from 'node:net';
import type { FastifyInstance } from 'fastify';
import { io as ioc, type Socket } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, loginAs } from './helpers';

let app: FastifyInstance;
let base: string;

beforeAll(async () => {
  app = await createTestApp();
  await app.listen({ port: 0, host: '127.0.0.1' });
  base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  await app.close();
});

function connect(cookie?: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const s = ioc(base, { path: '/ws', transports: ['websocket'], extraHeaders: cookie ? { cookie } : {} });
    s.on('connect', () => resolve(s));
    s.on('connect_error', reject);
  });
}

describe('Socket.IO /ws rooms', () => {
  it('kitchen staff receives kitchen events but not driver events', async () => {
    const cookie = await loginAs(app, 'Dapur');
    const s = await connect(cookie);
    const got: string[] = [];
    s.on('menu.availability', () => got.push('kitchen'));
    app.realtime.emitStaff(['driver'], 'menu.availability', {
      kind: 'item',
      id: 1,
      available: false,
      at: new Date().toISOString(),
    });
    app.realtime.emitStaff(['kitchen'], 'menu.availability', {
      kind: 'item',
      id: 1,
      available: false,
      at: new Date().toISOString(),
    });
    await new Promise((r) => setTimeout(r, 200));
    expect(got).toEqual(['kitchen']);
    s.disconnect();
  });

  it('anonymous socket connects and can ping', async () => {
    const s = await connect();
    const t = await new Promise<string>((resolve) => s.emit('ping', resolve));
    expect(new Date(t).getTime()).toBeGreaterThan(0);
    s.disconnect();
  });
});
