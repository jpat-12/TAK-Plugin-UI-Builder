// Canvas VIEW state: which platform is previewed, in which frame, at what screen size. Not part
// of the project (it doesn't change the design), so it lives here and in localStorage, not in
// the store.

import { ref, watch } from 'vue';
import { CUSTOM, FRAMES, SIZES, SKINNED, sizeFrame, type Chrome, type SizedFrame } from '../skins/frames';
import type { Target } from '../spec/types';

const KEY = 'takui:view';

type Size = { w: number; h: number };
interface Saved {
  target: Target;
  frames: Record<string, string>;
  /** chosen screen-size key per device kind, so "big screen" carries across desktop platforms */
  sizes: Partial<Record<Chrome, string>>;
  custom: Partial<Record<Chrome, Size>>;
}

function load(): Saved {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    if (SKINNED.includes(v.target)) return { target: v.target, frames: v.frames ?? {}, sizes: v.sizes ?? {}, custom: v.custom ?? {} };
  } catch { /* per-viewer convenience only: fall back to defaults */ }
  return { target: 'atak', frames: {}, sizes: {}, custom: {} };
}

const initial = load();
export const previewTarget = ref<Target>(initial.target);
/** chosen frame key per target */
export const frameChoice = ref<Record<string, string>>(initial.frames);
export const sizeChoice = ref<Partial<Record<Chrome, string>>>(initial.sizes);
export const customSize = ref<Partial<Record<Chrome, Size>>>(initial.custom);

export function frameKeyFor(t: Target): string {
  const options = FRAMES[t] ?? {};
  const k = frameChoice.value[t];
  return k && k in options ? k : Object.keys(options)[0]!;
}

/** Selected size key for a device kind: a preset key or 'custom' */
export function sizeKeyFor(chrome: Chrome, fallback: string): string {
  const k = sizeChoice.value[chrome];
  return k && (k === CUSTOM || k in SIZES[chrome]) ? k : fallback;
}

/** The frame the canvas shows for a target, at the chosen screen size */
export function frameFor(t: Target): SizedFrame {
  const f = FRAMES[t]![frameKeyFor(t)]!;
  const key = sizeKeyFor(f.chrome, f.size);
  const fallback = SIZES[f.chrome][f.size]!;
  return sizeFrame(f, key, customSize.value[f.chrome] ?? { w: fallback.w, h: fallback.h });
}

watch([previewTarget, frameChoice, sizeChoice, customSize], () => {
  try {
    localStorage.setItem(KEY, JSON.stringify({
      target: previewTarget.value, frames: frameChoice.value, sizes: sizeChoice.value, custom: customSize.value,
    }));
  } catch { /* ignore */ }
}, { deep: true });
