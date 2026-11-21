// Canvas VIEW state: which platform is previewed, in which frame. Not part of the project
// (it doesn't change the design), so it lives here and in localStorage, not in the store.

import { ref, watch } from 'vue';
import { FRAMES, SKINNED } from '../skins/frames';
import type { Target } from '../spec/types';

const KEY = 'takui:view';

function load(): { target: Target; frames: Record<string, string> } {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    if (SKINNED.includes(v.target)) return { target: v.target, frames: v.frames ?? {} };
  } catch { /* per-viewer convenience only: fall back to defaults */ }
  return { target: 'atak', frames: {} };
}

const initial = load();
export const previewTarget = ref<Target>(initial.target);
/** chosen frame key per target */
export const frameChoice = ref<Record<string, string>>(initial.frames);

export function frameKeyFor(t: Target): string {
  const options = FRAMES[t] ?? {};
  const k = frameChoice.value[t];
  return k && k in options ? k : Object.keys(options)[0]!;
}

watch([previewTarget, frameChoice], () => {
  try { localStorage.setItem(KEY, JSON.stringify({ target: previewTarget.value, frames: frameChoice.value })); } catch { /* ignore */ }
}, { deep: true });
