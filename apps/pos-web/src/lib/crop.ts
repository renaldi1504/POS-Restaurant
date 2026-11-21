/** Potong & kecilkan foto di klien sebelum upload (menu 4:3, logo 1:1). */

export interface PixelArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Ukuran keluaran: rasio area potong dipertahankan, lebar maks `maxWidth` (tidak diperbesar). */
export function outputSize(
  area: Pick<PixelArea, 'width' | 'height'>,
  maxWidth = 1200,
): { width: number; height: number } {
  const w = Math.max(1, Math.round(Math.min(area.width, maxWidth)));
  const h = Math.max(1, Math.round((w * area.height) / area.width));
  return { width: w, height: h };
}

export interface CanvasLike {
  width: number;
  height: number;
  getContext(type: '2d'): {
    drawImage(...args: unknown[]): void;
    imageSmoothingQuality?: string;
    fillStyle?: string;
    fillRect?(x: number, y: number, w: number, h: number): void;
  } | null;
  toBlob(cb: (b: Blob | null) => void, type?: string, quality?: number): void;
  toDataURL?(type?: string): string;
}

let webpCache: boolean | null = null;
/** Apakah browser bisa mengekspor WebP dari canvas. */
export function supportsWebp(
  makeCanvas: () => CanvasLike = () => document.createElement('canvas') as unknown as CanvasLike,
): boolean {
  if (webpCache !== null) return webpCache;
  try {
    const c = makeCanvas();
    c.width = c.height = 1;
    webpCache = !!c.toDataURL && c.toDataURL('image/webp').startsWith('data:image/webp');
  } catch {
    webpCache = false;
  }
  return webpCache;
}

/**
 * Gambar area potong ke canvas berukuran `outputSize` lalu ekspor (WebP bila didukung, else JPEG 0.85).
 * `makeCanvas` bisa disuntik untuk test.
 */
export async function cropToBlob(
  image: CanvasImageSource,
  area: PixelArea,
  opts: {
    maxWidth?: number;
    quality?: number;
    type?: 'image/jpeg' | 'image/webp';
    makeCanvas?: () => CanvasLike;
  } = {},
): Promise<{ blob: Blob; width: number; height: number; type: string }> {
  const makeCanvas = opts.makeCanvas ?? (() => document.createElement('canvas') as unknown as CanvasLike);
  const type = opts.type ?? (supportsWebp(makeCanvas) ? 'image/webp' : 'image/jpeg');
  const { width, height } = outputSize(area, opts.maxWidth ?? 1200);
  const canvas = makeCanvas();
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('localErr.canvas');
  ctx.imageSmoothingQuality = 'high';
  if (ctx.fillRect) {
    ctx.fillStyle = '#FFFFFF'; // latar putih untuk PNG transparan → JPEG
    ctx.fillRect(0, 0, width, height);
  }
  ctx.drawImage(image, area.x, area.y, area.width, area.height, 0, 0, width, height);
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('localErr.photoExport'))),
      type,
      opts.quality ?? 0.85,
    ),
  );
  return { blob, width, height, type };
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('localErr.photoOpen'));
    img.src = src;
  });
}

/** Blob → File dengan ekstensi sesuai tipe. */
export function blobToFile(blob: Blob, base: string): File {
  const ext = blob.type === 'image/webp' ? 'webp' : 'jpg';
  return new File([blob], `${base}.${ext}`, { type: blob.type || 'image/jpeg' });
}
