// Browser-only: turns an uploaded picture (PNG, JPG, SVG, WebP...) into the square PNG data:
// URL stored in entry.iconImage, and reads its pixels for "colors from my icon". The spec
// only ever holds the resized PNG, so every emitter and export gets one predictable format.

import { BANNER_LOGO_HEIGHT, ICON_SIZE } from '../spec/types';

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("That file couldn't be opened as a picture. Try a PNG, JPG or SVG."));
    img.src = src;
  });
}

const readAsDataUrl = (f: File) => new Promise<string>((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result));
  r.onerror = () => reject(new Error("That file couldn't be read."));
  r.readAsDataURL(f);
});

/** Fit (not crop) the picture into a transparent ICON_SIZE square, centered */
export async function iconFromFile(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error(`"${file.name}" isn't a picture. Pick a PNG, JPG or SVG file.`);
  const img = await loadImage(await readAsDataUrl(file));
  const w = img.naturalWidth || ICON_SIZE, h = img.naturalHeight || ICON_SIZE;
  const k = ICON_SIZE / Math.max(w, h);
  const c = document.createElement('canvas');
  c.width = c.height = ICON_SIZE;
  const g = c.getContext('2d')!;
  g.imageSmoothingQuality = 'high';
  g.drawImage(img, (ICON_SIZE - w * k) / 2, (ICON_SIZE - h * k) / 2, w * k, h * k);
  return c.toDataURL('image/png');
}

/** RGBA pixels of a (data: URL) image, downscaled: enough to find its main colors */
export async function iconPixels(dataUrl: string): Promise<Uint8ClampedArray> {
  const img = await loadImage(dataUrl);
  const c = document.createElement('canvas');
  c.width = c.height = 48;
  const g = c.getContext('2d')!;
  g.drawImage(img, 0, 0, 48, 48);
  return g.getImageData(0, 0, 48, 48).data;
}

/** A banner logo: keeps its shape, BANNER_LOGO_HEIGHT tall, at most 3× as wide */
export async function logoFromFile(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error(`"${file.name}" isn't a picture. Pick a PNG, JPG or SVG file.`);
  const img = await loadImage(await readAsDataUrl(file));
  const w0 = img.naturalWidth || BANNER_LOGO_HEIGHT, h0 = img.naturalHeight || BANNER_LOGO_HEIGHT;
  const k = Math.min(BANNER_LOGO_HEIGHT / h0, (BANNER_LOGO_HEIGHT * 3) / w0);
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w0 * k));
  c.height = Math.max(1, Math.round(h0 * k));
  const g = c.getContext('2d')!;
  g.imageSmoothingQuality = 'high';
  g.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/png');
}
