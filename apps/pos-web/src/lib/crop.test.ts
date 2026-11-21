import { describe, expect, it, vi } from 'vitest';
import { cropToBlob, outputSize, type CanvasLike } from './crop';

function fakeCanvas() {
  const drawImage = vi.fn();
  const c: CanvasLike & { drawImage: typeof drawImage; exportedType?: string; quality?: number } = {
    width: 0,
    height: 0,
    drawImage,
    getContext: () => ({ drawImage, fillRect: () => {} }),
    toBlob(cb, type, quality) {
      c.exportedType = type;
      c.quality = quality;
      cb(new Blob(['x'], { type }));
    },
    toDataURL: () => 'data:image/png;base64,', // WebP tidak didukung
  };
  return c;
}

describe('crop → canvas', () => {
  it('outputSize: lebar maks 1200, rasio dipertahankan, tidak memperbesar', () => {
    expect(outputSize({ width: 3000, height: 2250 })).toEqual({ width: 1200, height: 900 }); // 4:3
    expect(outputSize({ width: 800, height: 600 })).toEqual({ width: 800, height: 600 });
    expect(outputSize({ width: 2000, height: 2000 }, 1200)).toEqual({ width: 1200, height: 1200 }); // logo 1:1
    expect(outputSize({ width: 1601, height: 1201 })).toEqual({ width: 1200, height: 900 });
  });

  it('menggambar area potong ke canvas 4:3 dan mengekspor JPEG 0.85', async () => {
    const canvas = fakeCanvas();
    const img = {} as CanvasImageSource;
    const res = await cropToBlob(
      img,
      { x: 100, y: 50, width: 2400, height: 1800 },
      { makeCanvas: () => canvas },
    );
    expect(res.width).toBe(1200);
    expect(res.height).toBe(900);
    expect(res.width / res.height).toBeCloseTo(4 / 3);
    expect(canvas.width).toBe(1200);
    expect(canvas.height).toBe(900);
    expect(canvas.drawImage).toHaveBeenCalledWith(img, 100, 50, 2400, 1800, 0, 0, 1200, 900);
    expect(res.type).toBe('image/jpeg');
    expect(canvas.quality).toBe(0.85);
    expect(res.blob.type).toBe('image/jpeg');
  });

  it('bisa memaksa WebP', async () => {
    const canvas = fakeCanvas();
    const res = await cropToBlob(
      {} as CanvasImageSource,
      { x: 0, y: 0, width: 500, height: 500 },
      { makeCanvas: () => canvas, type: 'image/webp' },
    );
    expect(res).toMatchObject({ width: 500, height: 500, type: 'image/webp' });
  });
});
