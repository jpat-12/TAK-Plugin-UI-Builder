// Ready-made color sets for the "Launch icon & colors" panel. Every accent is checked by a test
// to stay readable (≥ 3:1) on every platform's dark panel, so a preset never trips the
// validator's contrast warning.

import { liftTo, luminance, mix, PLATFORM_BG } from '../spec/color';
import type { Target, Theme } from '../spec/types';

export interface ColorPreset { name: string; theme: Required<Theme> }

export const PRESETS: ColorPreset[] = [
  { name: 'Fire', theme: { accent: '#ff8a3d', primary: '#c62828', header: '#4a1210' } },
  { name: 'EMS', theme: { accent: '#ff6b6b', primary: '#1565c0', header: '#13294b' } },
  { name: 'Law', theme: { accent: '#64b5f6', primary: '#1a3d7c', header: '#0f1f3d' } },
  { name: 'Search & rescue', theme: { accent: '#ffb300', primary: '#e65100', header: '#3d2a00' } },
  { name: 'Field green', theme: { accent: '#81c784', primary: '#2e7d32', header: '#1b3a1d' } },
  { name: 'Night (red)', theme: { accent: '#ff5252', primary: '#7f1d1d', header: '#2a0a0a' } },
  { name: 'High visibility', theme: { accent: '#ffeb3b', primary: '#fbc02d', header: '#333333' } },
];

/** The lightest panel background among the targets: an accent readable there is readable on all */
export function worstBackground(targets: readonly Target[]): string {
  return targets.map((t) => PLATFORM_BG[t]).sort((a, b) => luminance(b) - luminance(a))[0] ?? PLATFORM_BG.atak;
}

/** A full color set built around one brand color (e.g. the main color of the uploaded icon) */
export function themeFrom(brand: string, targets: readonly Target[]): Required<Theme> {
  return { accent: liftTo(brand, worstBackground(targets)), primary: brand, header: mix(brand, '#000000', 0.65) };
}
