import type { FastifyError, FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import type { ErrorCode, ErrorResponse } from '@pos/shared';

/** Error aplikasi → `{ error: { code, message, details? } }` dengan HTTP status. */
export class AppError extends Error {
  readonly statusCode: number;
  readonly code: ErrorCode;
  readonly details?: unknown;
  constructor(statusCode: number, code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (message = 'Permintaan tidak valid', details?: unknown) =>
  new AppError(400, 'BAD_REQUEST', message, details);
export const validationError = (message = 'Data tidak valid', details?: unknown) =>
  new AppError(400, 'VALIDATION_ERROR', message, details);
export const unauthorized = (message = 'Silakan masuk dulu') => new AppError(401, 'UNAUTHORIZED', message);
export const forbidden = (message = 'Tidak punya akses') => new AppError(403, 'FORBIDDEN', message);
export const notFound = (message = 'Data tidak ditemukan') => new AppError(404, 'NOT_FOUND', message);
export const conflict = (code: ErrorCode = 'CONFLICT', message = 'Data bentrok', details?: unknown) =>
  new AppError(409, code, message, details);
/** 422 untuk aturan bisnis (shift belum buka, opsi tidak valid, transisi salah, dll). */
export const unprocessable = (code: ErrorCode, message: string, details?: unknown) =>
  new AppError(422, code, message, details);

const STATUS_TO_CODE: Record<number, ErrorCode> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  413: 'FILE_TOO_LARGE',
  415: 'UNSUPPORTED_FILE',
  429: 'RATE_LIMITED',
};

export function errorBody(code: ErrorCode, message: string, details?: unknown): ErrorResponse {
  return { error: details === undefined ? { code, message } : { code, message, details } };
}

export function registerErrorHandlers(app: FastifyInstance): void {
  app.setErrorHandler((err: FastifyError | AppError | ZodError | Error, req, reply) => {
    if (err instanceof AppError) {
      return reply.status(err.statusCode).send(errorBody(err.code, err.message, err.details));
    }
    if (err instanceof ZodError) {
      return reply.status(400).send(errorBody('VALIDATION_ERROR', 'Data tidak valid', err.issues));
    }
    const status = (err as FastifyError).statusCode ?? 500;
    if (status === 429) {
      return reply.status(429).send(errorBody('RATE_LIMITED', 'Terlalu banyak permintaan, tunggu sebentar'));
    }
    if (status >= 400 && status < 500) {
      const code = STATUS_TO_CODE[status] ?? 'BAD_REQUEST';
      return reply.status(status).send(errorBody(code, err.message));
    }
    req.log.error({ err }, 'Unhandled error');
    return reply.status(500).send(errorBody('INTERNAL_ERROR', 'Terjadi kesalahan server'));
  });

  app.setNotFoundHandler((req, reply) => {
    reply.status(404).send(errorBody('NOT_FOUND', `Route ${req.method} ${req.url} tidak ditemukan`));
  });
}
