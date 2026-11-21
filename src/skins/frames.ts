// Device/window frames each skin previews in. Sizes are approximate host-UI dimensions: they
// exist to catch "this row is too wide for the panel", not to be pixel-accurate.

import type { Target } from '../spec/types';

export interface Frame {
  label: string;
  /** whole device/window, in CSS px */
  w: number;
  h: number;
  /** plugin panel width, px */
  pane: number;
  dock: 'right' | 'float';
  chrome: 'tablet' | 'phone' | 'window';
  /** height of fake host UI above the map (ribbon, nav bar), px */
  topbar?: number;
  /** what to call the host window in the frame's title bar */
  host?: string;
}

/** Targets with a preview skin (TAKX added 2026-11-10 from its 5.8.0 SDK screenshots) */
export const SKINNED: readonly Target[] = ['atak', 'cloudtak', 'wintak', 'webtak', 'takx'];

export const FRAMES: Record<string, Record<string, Frame>> = {
  atak: {
    'tablet-half': { label: 'Tablet · half pane', w: 1100, h: 680, pane: 550, dock: 'right', chrome: 'tablet' },
    'tablet-full': { label: 'Tablet · full pane', w: 1100, h: 680, pane: 1100, dock: 'right', chrome: 'tablet' },
    phone: { label: 'Phone · portrait', w: 380, h: 760, pane: 380, dock: 'right', chrome: 'phone' },
  },
  cloudtak: {
    browser: { label: 'Browser · side panel', w: 1280, h: 760, pane: 420, dock: 'right', chrome: 'window', host: 'CloudTAK' },
    narrow: { label: 'Small laptop', w: 1024, h: 680, pane: 400, dock: 'right', chrome: 'window', host: 'CloudTAK' },
  },
  wintak: {
    desktop: { label: 'Desktop · dock pane', w: 1280, h: 760, pane: 380, dock: 'right', chrome: 'window', topbar: 64, host: 'WinTAK' },
    wide: { label: 'Desktop · wide pane', w: 1280, h: 760, pane: 560, dock: 'right', chrome: 'window', topbar: 64, host: 'WinTAK' },
  },
  takx: {
    // generated plugins dock at ComponentPosition.RIGHT; the ribbon is TAKX's tall icon toolbar
    desktop: { label: 'Desktop · docked right', w: 1280, h: 780, pane: 400, dock: 'right', chrome: 'window', topbar: 96, host: 'TAKX' },
  },
  webtak: {
    browser: { label: 'Browser · floating panel', w: 1280, h: 760, pane: 400, dock: 'float', chrome: 'window', topbar: 44, host: 'WebTAK' },
  },
};
