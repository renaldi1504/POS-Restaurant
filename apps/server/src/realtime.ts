/**
 * Socket.IO di path `/ws` (SPEC §6). Room ditentukan server dari cookie sesi saat handshake:
 * staf → room per permission (cashier/kitchen/driver/admin); pelanggan → customer:<id>;
 * mode meja → table:<sessionId> (bila sesi meja sudah terbuka) + room internal `_tbl:<tableId>`.
 *
 * Pakai helper emit di service (bukan `io.emit` langsung):
 *   app.realtime.emitStaff(['cashier','kitchen'], 'order.created', { order, at })
 *   app.realtime.emitCustomer(customerId, 'order.updated', { order: publicOrder, at })
 *   app.realtime.emitTable(sessionId, 'table.updated', {...})
 *   app.realtime.attachTableSession(tableId, sessionId)  // saat sesi meja baru dibuka
 */
import { and, eq, inArray } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { Server, type Socket } from 'socket.io';
import {
  ROOMS,
  SOCKET_PATH,
  staffRoomsFor,
  type ClientToServerEvents,
  type CustomerServerToClientEvents,
  type SocketData,
  type StaffRoom,
  type StaffServerToClientEvents,
} from '@pos/shared';
import { tableSessions } from './db/schema';
import { resolveSessionsFromCookies } from './lib/session';

type AnyServerEvents = StaffServerToClientEvents & CustomerServerToClientEvents;
export type IoServer = Server<ClientToServerEvents, AnyServerEvents, Record<string, never>, SocketData>;

export interface Realtime {
  io: IoServer;
  emitStaff<E extends keyof StaffServerToClientEvents>(
    rooms: StaffRoom[],
    event: E,
    payload: Parameters<StaffServerToClientEvents[E]>[0],
  ): void;
  emitCustomer<E extends keyof CustomerServerToClientEvents>(
    customerId: number,
    event: E,
    payload: Parameters<CustomerServerToClientEvents[E]>[0],
  ): void;
  emitTable<E extends keyof CustomerServerToClientEvents>(
    sessionId: number,
    event: E,
    payload: Parameters<CustomerServerToClientEvents[E]>[0],
  ): void;
  /** Masukkan semua socket pelanggan di meja ini ke room `table:<sessionId>`. */
  attachTableSession(tableId: number, sessionId: number): void;
}

const internalTableRoom = (tableId: number) => `_tbl:${tableId}`;

export function createRealtime(app: FastifyInstance): Realtime {
  const io: IoServer = new Server(app.server, {
    path: SOCKET_PATH,
    serveClient: false,
    cors: { origin: [app.config.POS_ORIGIN, app.config.ORDER_ORIGIN], credentials: true },
  });

  io.use(async (socket, next) => {
    try {
      const header = socket.request.headers.cookie ?? '';
      const cookies = app.parseCookie(header) as Record<string, string | undefined>;
      const { staff, customer } = await resolveSessionsFromCookies(app, cookies);
      if (staff) {
        socket.data = { kind: 'staff', userId: staff.id };
        await socket.join(staffRoomsFor(staff.permissions));
      } else if (customer) {
        socket.data = {
          kind: 'customer',
          customerId: customer.customerId ?? undefined,
          tableId: customer.tableId ?? undefined,
        };
        if (customer.customerId) await socket.join(ROOMS.customer(customer.customerId));
        if (customer.tableId) {
          await socket.join(internalTableRoom(customer.tableId));
          const open = await app.db
            .select({ id: tableSessions.id })
            .from(tableSessions)
            .where(
              and(
                eq(tableSessions.tableId, customer.tableId),
                inArray(tableSessions.status, ['open', 'bill_requested']),
              ),
            )
            .limit(1);
          if (open[0]) await socket.join(ROOMS.table(open[0].id));
        }
      } else {
        socket.data = { kind: 'anonymous' };
      }
      next();
    } catch (err) {
      next(err as Error);
    }
  });

  io.on(
    'connection',
    (socket: Socket<ClientToServerEvents, AnyServerEvents, Record<string, never>, SocketData>) => {
      socket.on('ping', (ack) => {
        if (typeof ack === 'function') ack(new Date().toISOString());
      });
    },
  );

  // Putuskan socket SEBELUM server HTTP ditutup: koneksi WebSocket yang masih terbuka membuat
  // server.close() menunggu selamanya (shutdown SIGTERM menggantung). Klien menerima
  // "io server disconnect" lalu menyambung ulang sendiri setelah server hidup lagi.
  app.addHook('preClose', async () => {
    io.disconnectSockets(true);
    io.engine.close();
  });
  app.addHook('onClose', async () => {
    await new Promise<void>((resolve) => io.close(() => resolve()));
  });

  return {
    io,
    emitStaff(rooms, event, payload) {
      if (!rooms.length) return;
      (io.to(rooms) as unknown as { emit: (e: string, p: unknown) => void }).emit(event, payload);
    },
    emitCustomer(customerId, event, payload) {
      (io.to(ROOMS.customer(customerId)) as unknown as { emit: (e: string, p: unknown) => void }).emit(
        event,
        payload,
      );
    },
    emitTable(sessionId, event, payload) {
      (io.to(ROOMS.table(sessionId)) as unknown as { emit: (e: string, p: unknown) => void }).emit(
        event,
        payload,
      );
    },
    attachTableSession(tableId, sessionId) {
      io.in(internalTableRoom(tableId)).socketsJoin(ROOMS.table(sessionId));
    },
  };
}
