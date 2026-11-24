// Pure color math for the plugin's custom colors (Project.theme). WCAG 2.x relative luminance
// and contrast ratio, so the builder can pick readable text automatically and warn when a
// chosen color would be hard to see on a platform's background.

const HEX = /^#[0-9a-fA-F]{6}$/;
export const isHex = (s: string) => HEX.test(s);

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const toHex = (c: number[]) => '#' + c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');

export function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** 1 (same) … 21 (black on white) */
export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m) as [number, number];
  return (x + 0.05) / (y + 0.05);
}

/** Black or white, whichever reads better on `bg` */
export const textOn = (bg: string) => (contrast(bg, '#000000') >= contrast(bg, '#ffffff') ? '#000000' : '#ffffff');

/** Linear mix: t = 0 → a, t = 1 → b */
export function mix(a: string, b: string, t: number): string {
  const [x, y] = [rgb(a), rgb(b)];
  return toHex(x.map((v, i) => v + (y[i]! - v) * t));
}

/** Contrast that non-text UI (underlines, toggles, tab markers) needs: WCAG 1.4.11 */
export const UI_CONTRAST = 3;

/** Each platform's panel background (the --k-bg of src/skins/themes/<target>.css; a test keeps
 *  them in sync). All TAK hosts are dark, so an accent must stand out against dark grey. */
export const PLATFORM_BG = {
  atak: '#1c1c1c', cloudtak: '#151f2c', takx: '#2b2b2b', webtak: '#212529', wintak: '#2b2b2e',
} as const;

/** The color, mixed toward white just enough to reach `ratio` against `bg` (dark backgrounds) */
export function liftTo(hex: string, bg: string, ratio = UI_CONTRAST): string {
  for (let t = 0; t <= 1.0001; t += 0.05) {
    const c = mix(hex, '#ffffff', t);
    if (contrast(c, bg) >= ratio) return c;
  }
  return '#ffffff';
}

/**
 * Up to `n` distinct, colorful hues from an image's RGBA pixels (canvas ImageData order),
 * most common first. Greys, near-black/white and transparent pixels are skipped: they make
 * poor brand colors. Used for "colors from my icon".
 */
export function dominantColors(px: ArrayLike<number>, n = 3): string[] {
  const buckets = new Map<number, { w: number; r: number; g: number; b: number }>();
  for (let i = 0; i + 3 < px.length; i += 4) {
    const [r, g, b, a] = [px[i]!, px[i + 1]!, px[i + 2]!, px[i + 3]!];
    if (a < 128) continue;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const sat = max === 0 ? 0 : (max - min) / max;
    if (sat < 0.25 || max < 40) continue;
    const hue = hueOf(r, g, b, max, min);
    const key = Math.floor(hue / 30); // 12 hue buckets
    const e = buckets.get(key) ?? { w: 0, r: 0, g: 0, b: 0 };
    const w = sat; // vivid pixels count more
    e.w += w; e.r += r * w; e.g += g * w; e.b += b * w;
    buckets.set(key, e);
  }
  return [...buckets.values()].sort((x, y) => y.w - x.w).slice(0, n).map((e) => toHex([e.r / e.w, e.g / e.w, e.b / e.w]));
}

function hueOf(r: number, g: number, b: number, max: number, min: number): number {
  const d = max - min;
  if (d === 0) return 0;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}
