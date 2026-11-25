import { describe, expect, it } from 'vitest';
import { CUSTOM, FRAMES, SIZES, SIZE_MAX, SIZE_MIN, sizeFrame } from '../src/skins/frames';

describe('screen-size presets', () => {
  it('every frame has a default size that exists for its device kind', () => {
    for (const frames of Object.values(FRAMES)) {
      for (const f of Object.values(frames)) expect(SIZES[f.chrome][f.size], f.label).toBeDefined();
    }
  });

  it('offers big and small computers, tablets and phones', () => {
    expect(SIZES.window['big-screen']).toMatchObject({ w: 1920, h: 1080 });
    expect(SIZES.window['small-laptop']!.w).toBeLessThan(SIZES.window.laptop!.w);
    expect(SIZES.phone['big-phone']!.h).toBeGreaterThan(SIZES.phone['small-phone']!.h);
    expect(SIZES.tablet['big-tablet']!.w).toBeGreaterThan(SIZES.tablet['small-tablet']!.w);
  });

  it('scales ATAK half/full panes with the screen and keeps desktop panels fixed', () => {
    const half = FRAMES.atak!['tablet-half']!;
    expect(sizeFrame(half, 'big-tablet')).toMatchObject({ w: 1280, h: 800, pane: 640 });
    expect(sizeFrame(FRAMES.atak!.phone!, 'small-phone')).toMatchObject({ w: 360, pane: 360 });
    const wintak = FRAMES.wintak!.desktop!;
    expect(sizeFrame(wintak, 'big-screen').pane).toBe(380);
    expect(sizeFrame(wintak).w).toBe(SIZES.window.laptop!.w);
  });

  it('uses a typed-in size, clamped, and never lets a panel exceed its window', () => {
    const f = FRAMES.wintak!.wide!;
    expect(sizeFrame(f, CUSTOM, { w: 500, h: 400 })).toMatchObject({ w: 500, h: 400, pane: 500 });
    expect(sizeFrame(f, CUSTOM, { w: 10, h: 99999 })).toMatchObject({ w: SIZE_MIN, h: SIZE_MAX });
    expect(sizeFrame(FRAMES.webtak!.browser!, CUSTOM, { w: 300, h: 600 }).pane).toBe(252);
  });

  it('turns phones sideways for the landscape ATAK frame and gives the plugin half the screen', () => {
    const f = FRAMES.atak!['phone-landscape']!;
    // Pixel 7a-class phone: 915 wide, half of the whole screen (the cutout band doesn't shrink it)
    expect(sizeFrame(f)).toMatchObject({ w: 915, h: 412, pane: 458 });
    expect(sizeFrame(f, 'small-phone')).toMatchObject({ w: 640, h: 360 });
    // a portrait custom size is turned too, since the phone frames share it
    expect(sizeFrame(f, CUSTOM, { w: 400, h: 900 })).toMatchObject({ w: 900, h: 400 });
    expect(sizeFrame(FRAMES.atak!.phone!, CUSTOM, { w: 400, h: 900 })).toMatchObject({ w: 400, h: 900, pane: 400 });
  });

  it('gives every ATAK frame a status bar inset and a toolbar row for panes to open under', () => {
    for (const f of Object.values(FRAMES.atak!)) {
      expect(f.inset?.top, f.label).toBeGreaterThan(0);
      expect(f.toolbar, f.label).toBeGreaterThan(0);
    }
  });

  it('falls back to the default for an unknown size key', () => {
    expect(sizeFrame(FRAMES.atak!.phone!, 'big-screen')).toMatchObject({ w: 380, h: 760 });
  });
});
