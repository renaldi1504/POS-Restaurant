/**
 * Penyimpanan file: Cloudflare R2 (S3 API) bila R2_* diisi, selain itu disk lokal UPLOAD_DIR.
 * - public  (foto menu, logo)        → URL langsung (R2_PUBLIC_URL/... atau /uploads/public/...)
 * - private (bukti bayar, nota)       → /uploads/private/<key> (hanya staf login)
 */
import { randomUUID } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Readable } from 'node:stream';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { UPLOADS_PATH } from '@pos/shared';
import type { AppConfig } from '../config';

export type Visibility = 'public' | 'private';

export interface SaveInput {
  data: Buffer;
  mimetype: string;
  visibility: Visibility;
  /** Sub-folder, mis. 'menu', 'proofs', 'expenses', 'logo'. */
  folder: string;
}

export interface Storage {
  readonly driver: 'r2' | 'local';
  save(input: SaveInput): Promise<{ key: string; url: string }>;
  /** Stream file private (untuk route /uploads/private/*). null bila tidak ada. */
  readPrivate(key: string): Promise<{ stream: Readable; contentType?: string } | null>;
  localPublicDir: string;
}

export const ALLOWED_IMAGE_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
};

const safeKey = (key: string) => !key.includes('..') && /^[\w\-/.]+$/.test(key);

export function createStorage(config: AppConfig): Storage {
  const root = path.resolve(config.UPLOAD_DIR);
  const localPublicDir = path.join(root, 'public');

  if (config.features.r2) {
    const s3 = new S3Client({
      region: 'auto',
      endpoint: `https://${config.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: config.R2_ACCESS_KEY_ID!, secretAccessKey: config.R2_SECRET_ACCESS_KEY! },
    });
    const bucketFor = (v: Visibility) =>
      v === 'public' ? config.R2_BUCKET_PUBLIC! : (config.R2_BUCKET_PRIVATE ?? config.R2_BUCKET_PUBLIC!);
    return {
      driver: 'r2',
      localPublicDir,
      async save({ data, mimetype, visibility, folder }) {
        const ext = ALLOWED_IMAGE_TYPES[mimetype] ?? 'bin';
        const key = `${folder}/${randomUUID()}.${ext}`;
        await s3.send(
          new PutObjectCommand({
            Bucket: bucketFor(visibility),
            Key: key,
            Body: data,
            ContentType: mimetype,
          }),
        );
        const url =
          visibility === 'public'
            ? `${(config.R2_PUBLIC_URL ?? '').replace(/\/$/, '')}/${key}`
            : `${UPLOADS_PATH}/private/${key}`;
        return { key, url };
      },
      async readPrivate(key) {
        if (!safeKey(key)) return null;
        try {
          const out = await s3.send(new GetObjectCommand({ Bucket: bucketFor('private'), Key: key }));
          return { stream: out.Body as Readable, contentType: out.ContentType };
        } catch {
          return null;
        }
      },
    };
  }

  return {
    driver: 'local',
    localPublicDir,
    async save({ data, mimetype, visibility, folder }) {
      const ext = ALLOWED_IMAGE_TYPES[mimetype] ?? 'bin';
      const key = `${folder}/${randomUUID()}.${ext}`;
      const full = path.join(root, visibility, key);
      await mkdir(path.dirname(full), { recursive: true });
      await writeFile(full, data);
      return { key, url: `${UPLOADS_PATH}/${visibility}/${key}` };
    },
    async readPrivate(key) {
      if (!safeKey(key)) return null;
      const full = path.join(root, 'private', key);
      if (!existsSync(full)) return null;
      const ext = path.extname(full).slice(1);
      const contentType = Object.entries(ALLOWED_IMAGE_TYPES).find(([, e]) => e === ext)?.[0];
      return { stream: createReadStream(full), contentType };
    },
  };
}
