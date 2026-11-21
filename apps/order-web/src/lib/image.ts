/**
 * Kompres foto besar di perangkat sebelum upload (bukti transfer dari kamera HP bisa 5–10 MB).
 * Bila browser tidak mendukung canvas/createImageBitmap → file asli dikembalikan.
 */
export interface CompressOptions {
  maxDim?: number;
  quality?: number;
  /** Di bawah ukuran ini file tidak dikompres. */
  threshold?: number;
}

function loadImage(file: Blob): Promise<CanvasImageSource & { width: number; height: number }> {
  if (typeof createImageBitmap === 'function') return createImageBitmap(file);
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('image'));
    };
    img.src = url;
  });
}

export async function compressImage(file: File, opts: CompressOptions = {}): Promise<File> {
  const { maxDim = 1600, quality = 0.8, threshold = 700_000 } = opts;
  if (!file.type.startsWith('image/') || file.type === 'image/gif' || file.size <= threshold) return file;
  try {
    const img = await loadImage(file);
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(img, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (!blob || blob.size >= file.size) return file;
    const name = file.name.replace(/\.[^.]+$/, '') + '.jpg';
    return new File([blob], name, { type: 'image/jpeg' });
  } catch {
    return file;
  }
}
