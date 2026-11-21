import type { FastifyRequest } from 'fastify';
import { AppError, badRequest } from './errors';
import { ALLOWED_IMAGE_TYPES } from './storage';

/** Baca satu file gambar dari multipart (field apa pun, biasanya `file`). */
export async function readImageUpload(req: FastifyRequest): Promise<{ data: Buffer; mimetype: string }> {
  if (!req.isMultipart()) throw badRequest('Kirim sebagai multipart/form-data dengan field file');
  const file = await req.file();
  if (!file) throw badRequest('File tidak ada');
  if (!ALLOWED_IMAGE_TYPES[file.mimetype]) {
    file.file.resume();
    throw new AppError(415, 'UNSUPPORTED_FILE', 'Format file harus JPG, PNG, WEBP, atau HEIC');
  }
  const data = await file.toBuffer();
  if (file.file.truncated) throw new AppError(413, 'FILE_TOO_LARGE', 'File terlalu besar (maks 5 MB)');
  return { data, mimetype: file.mimetype };
}

/** Key storage dari URL private `/uploads/private/<key>`. */
export function privateKeyFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = /\/uploads\/private\/(.+)$/.exec(url);
  return m?.[1] ?? null;
}
