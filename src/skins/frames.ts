// Device/window frames each skin previews in, and the screen sizes a frame can be shown at.
// Sizes are approximate host-UI dimensions: they exist to catch "this row is too wide for the
// panel", not to be pixel-accurate.

import type { Target } from '../spec/types';

export type Chrome = 'tablet' | 'phone' | 'window';

export interface Frame {
  label: string;
  /** which screen-size presets apply, and the default one */
  chrome: Chrome;
  size: string;
  /** plugin panel width: fixed CSS px, or a share of the screen width */
  pane: number | 'full' | 'half';
  dock: 'right' | 'float';
  /** height of fake host UI above the map (ribbon, nav bar), px */
  topbar?: number;
  /** what to call the host window in the frame's title bar */
  host?: string;
  /** turn the size preset sideways (phones are portrait in SIZES) */
  landscape?: boolean;
  /** device areas the app can't draw in, px: status bar (top), camera cutout band (left, landscape
   *  phones), gesture strip (bottom). Half/full panes are measured from the width that's left. */
  inset?: { top: number; left: number; bottom: number };
  /** height of ATAK's toolbar row: panes open below it, flush right */
  toolbar?: number;
}

/** A frame at a concrete screen size: what the canvas and the mockups render */
export interface SizedFrame extends Omit<Frame, 'pane'> {
  w: number;
  h: number;
  pane: number;
}

export interface ScreenSize { label: string; w: number; h: number }

/** Preset screen sizes per kind of device, in CSS px. 'custom' is reserved for a typed-in size. */
export const SIZES: Record<Chrome, Record<string, ScreenSize>> = {
  window: {
    'big-screen': { label: 'Big screen computer', w: 1920, h: 1080 },
    desktop: { label: 'Desktop', w: 1440, h: 900 },
    laptop: { label: 'Laptop', w: 1280, h: 760 },
    'small-laptop': { label: 'Small laptop', w: 1024, h: 680 },
  },
  tablet: {
    'big-tablet': { label: 'Big tablet', w: 1280, h: 800 },
    tablet: { label: 'Tablet', w: 1100, h: 680 },
    'small-tablet': { label: 'Small tablet', w: 1024, h: 600 },
  },
  phone: {
    'big-phone': { label: 'Big phone', w: 412, h: 915 },
    phone: { label: 'Phone', w: 380, h: 760 },
    'small-phone': { label: 'Small phone', w: 360, h: 640 },
  },
};

export const CUSTOM = 'custom';
/** bounds for a typed-in size */
export const SIZE_MIN = 240;
export const SIZE_MAX = 3840;

/** Targets with a preview skin (TAKX added 2026-11-10 from its 5.8.0 SDK screenshots) */
export const SKINNED: readonly Target[] = ['atak', 'cloudtak', 'wintak', 'webtak', 'takx'];

// ATAK insets and toolbar height are measured from ATAK 5.6 on a Pixel 7a (2400x1080 at 420 dpi,
// i.e. 914x411 dp): 28 dp status bar, 45 dp cutout band in landscape, 24 dp gesture strip, 50 dp
// toolbar row. A half pane is half of the map area, not of the whole screen. Tablets get the
// status bar only (their nav lives in the taskbar).
const ATAK_TABLET = { inset: { top: 24, left: 0, bottom: 0 }, toolbar: 48 };
export const FRAMES: Record<string, Record<string, Frame>> = {
  atak: {
    'tablet-half': { label: 'Tablet · half pane', chrome: 'tablet', size: 'tablet', pane: 'half', dock: 'right', ...ATAK_TABLET },
    'tablet-full': { label: 'Tablet · full pane', chrome: 'tablet', size: 'tablet', pane: 'full', dock: 'right', ...ATAK_TABLET },
    'phone-landscape': {
      label: 'Phone · landscape, half pane', chrome: 'phone', size: 'big-phone', pane: 'half', dock: 'right',
      landscape: true, inset: { top: 28, left: 45, bottom: 24 }, toolbar: 50,
    },
    phone: { label: 'Phone · portrait', chrome: 'phone', size: 'phone', pane: 'full', dock: 'right', inset: { top: 28, left: 0, bottom: 24 }, toolbar: 50 },
  },
  cloudtak: {
    browser: { label: 'Browser · side panel', chrome: 'window', size: 'laptop', pane: 420, dock: 'right', host: 'CloudTAK' },
  },
  wintak: {
    desktop: { label: 'Desktop · dock pane', chrome: 'window', size: 'laptop', pane: 380, dock: 'right', topbar: 64, host: 'WinTAK' },
    wide: { label: 'Desktop · wide pane', chrome: 'window', size: 'laptop', pane: 560, dock: 'right', topbar: 64, host: 'WinTAK' },
  },
  takx: {
    // generated plugins dock at ComponentPosition.RIGHT; the ribbon is TAKX's tall icon toolbar
    desktop: { label: 'Desktop · docked right', chrome: 'window', size: 'laptop', pane: 400, dock: 'right', topbar: 96, host: 'TAKX' },
  },
  webtak: {
    browser: { label: 'Browser · floating panel', chrome: 'window', size: 'laptop', pane: 400, dock: 'float', topbar: 44, host: 'WebTAK' },
  },
};

export const clampSize = (n: number) => Math.round(Math.min(SIZE_MAX, Math.max(SIZE_MIN, Number.isFinite(n) ? n : SIZE_MIN)));

/** Put a frame on a screen: a preset key, or 'custom' with a typed-in size. Unknown keys use the frame's default. */
export function sizeFrame(f: Frame, sizeKey?: string, custom?: { w: number; h: number }): SizedFrame {
  const presets = SIZES[f.chrome];
  const picked = sizeKey === CUSTOM && custom
    ? { w: clampSize(custom.w), h: clampSize(custom.h) }
    : presets[sizeKey && sizeKey in presets ? sizeKey : f.size]!;
  // phone sizes (presets and the typed-in one, shared with the portrait frame) are portrait
  const s = f.landscape && picked.h > picked.w ? { w: picked.h, h: picked.w } : picked;
  const usable = s.w - (f.inset?.left ?? 0);
  const pane = f.pane === 'full' ? usable
    : f.pane === 'half' ? Math.round(usable / 2)
    // a fixed-width side panel can't be wider than the window it sits in
    : Math.min(f.pane, s.w - (f.dock === 'float' ? 48 : 0));
  return { ...f, w: s.w, h: s.h, pane };
}
