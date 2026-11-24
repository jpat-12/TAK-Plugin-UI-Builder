// Launch icon + custom colors (Project.theme, entry.iconImage): color math, presets, spec
// shape, validator warnings, preview variables, handoff output and the store.
import { readFileSync } from 'node:fs';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildHandoff, buildPrompt, ICON_FILE } from '../src/export/handoff';
import { handoffFiles } from '../src/export/package';
import { PRESETS, themeFrom } from '../src/inspector/presets';
import { themeVars } from '../src/skins/theme';
import { bannerFor } from '../src/skins/banner';
import { collectText, setText } from '../src/spell/text';
import { contrast, dominantColors, liftTo, PLATFORM_BG, textOn, UI_CONTRAST } from '../src/spec/color';
import { loadProject } from '../src/spec/load';
import { TARGETS, type Project } from '../src/spec/types';
import { useProject } from '../src/store/project';

// 1×1 transparent PNG
const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
const ICON = `data:image/png;base64,${PNG_B64}`;
const raw = () => JSON.parse(readFileSync('test/fixtures/event-cad.takui.json', 'utf8'));
const load = (r: unknown): Project => {
  const res = loadProject(r);
  if (!res.ok) throw new Error(res.issues.map((i) => i.message).join('; '));
  return res.project;
};
const branded = () => load({ ...raw(), entry: { ...raw().entry, iconImage: ICON }, theme: { accent: '#ff8a3d', primary: '#ffeb3b', header: '#13294b' } });

beforeEach(() => setActivePinia(createPinia()));

describe('color math', () => {
  it('contrast and readable text', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrast('#777777', '#777777')).toBe(1);
    expect(textOn('#ffeb3b')).toBe('#000000');
    expect(textOn('#13294b')).toBe('#ffffff');
  });
  it('liftTo brightens a dark color just enough', () => {
    const lifted = liftTo('#1a3d7c', PLATFORM_BG.takx);
    expect(contrast(lifted, PLATFORM_BG.takx)).toBeGreaterThanOrEqual(UI_CONTRAST);
    expect(liftTo('#ffeb3b', PLATFORM_BG.atak)).toBe('#ffeb3b'); // already fine: unchanged
  });
  it('dominantColors finds the vivid hue and skips grey / transparent pixels', () => {
    const px: number[] = [];
    for (let i = 0; i < 30; i++) px.push(200, 30, 30, 255); // red
    for (let i = 0; i < 90; i++) px.push(128, 128, 128, 255); // grey (ignored)
    for (let i = 0; i < 90; i++) px.push(0, 200, 0, 0); // transparent (ignored)
    for (let i = 0; i < 10; i++) px.push(30, 60, 220, 255); // blue
    const c = dominantColors(px);
    expect(c).toEqual(['#c81e1e', '#1e3cdc']);
  });
  it('PLATFORM_BG matches each skin\'s --k-bg', () => {
    for (const t of TARGETS) {
      const css = readFileSync(`src/skins/themes/${t}.css`, 'utf8');
      expect(css.match(/--k-bg:\s*(#[0-9a-f]{6})/i)?.[1]?.toLowerCase(), t).toBe(PLATFORM_BG[t]);
    }
  });
});

describe('presets', () => {
  it.each(PRESETS.map((p) => [p.name, p] as const))('%s: highlight readable on every platform', (_n, pr) => {
    for (const t of TARGETS) expect(contrast(pr.theme.accent, PLATFORM_BG[t]), t).toBeGreaterThanOrEqual(UI_CONTRAST);
    const r = loadProject({ ...raw(), meta: { ...raw().meta, targets: [...TARGETS] }, theme: pr.theme });
    expect(r.ok && r.issues.some((i) => i.path.startsWith('/theme'))).toBe(false);
  });
  it('themeFrom(icon color) yields a set that passes the contrast check', () => {
    const t = themeFrom('#0b2a66', TARGETS);
    expect(t.primary).toBe('#0b2a66');
    for (const x of TARGETS) expect(contrast(t.accent, PLATFORM_BG[x])).toBeGreaterThanOrEqual(UI_CONTRAST);
  });
});

describe('spec', () => {
  it('accepts a theme and a PNG icon, rejects bad colors and non-PNG images', () => {
    expect(branded().theme?.accent).toBe('#ff8a3d');
    expect(loadProject({ ...raw(), theme: { accent: 'orange' } }).ok).toBe(false);
    expect(loadProject({ ...raw(), theme: { glow: '#ffffff' } }).ok).toBe(false);
    expect(loadProject({ ...raw(), entry: { ...raw().entry, iconImage: 'data:image/svg+xml;base64,PHN2Zz4=' } }).ok).toBe(false);
    expect(loadProject({ ...raw(), entry: { ...raw().entry, iconImage: 'https://example.com/i.png' } }).ok).toBe(false);
  });
  it('warns, in plain words, when the highlight color would vanish on a dark panel', () => {
    const r = loadProject({ ...raw(), theme: { accent: '#333333' } });
    if (!r.ok) throw new Error('should load');
    const w = r.issues.find((i) => i.path === '/theme/accent');
    expect(w?.severity).toBe('warning');
    expect(w?.message).toMatch(/hard to see .*ATAK/);
    const ok = loadProject({ ...raw(), theme: { accent: '#ff8a3d' } });
    expect(ok.ok && ok.issues.some((i) => i.path.startsWith('/theme'))).toBe(false);
  });
});

describe('preview', () => {
  it('maps the theme onto the skin variables, with readable text', () => {
    expect(themeVars(undefined)).toEqual({});
    expect(themeVars({ accent: '#ff8a3d', primary: '#ffeb3b', header: '#13294b' })).toEqual({
      '--k-accent': '#ff8a3d', '--k-primary': '#ffeb3b', '--k-primary-fg': '#000000', '--k-titlebar': '#13294b', '--k-title-fg': '#ffffff',
    });
  });
});

describe('handoff', () => {
  it('a plain project has no Look and feel section', () => {
    expect(buildHandoff(load(raw()), { generatedAt: '2026-11-24' })).not.toContain('## Look and feel');
  });
  it('lists the icon file and each custom color with its text color', () => {
    const md = buildHandoff(branded(), { generatedAt: '2026-11-24' });
    expect(md).toContain('## Look and feel');
    expect(md).toContain(`\`${ICON_FILE}\``);
    expect(md).toContain('| Highlight | `#ff8a3d` | n/a |');
    expect(md).toContain('| Main buttons | `#ffeb3b` | `#000000` |');
    expect(md).toContain('| Title bar | `#13294b` | `#ffffff` |');
  });
  it('the zip carries the icon as real PNG bytes', () => {
    const files = handoffFiles(branded(), '2026-11-24', [], false);
    const png = files[ICON_FILE] as Uint8Array;
    expect(Buffer.from(png).toString('base64')).toBe(PNG_B64);
    expect([...png.slice(0, 4)]).toEqual([137, 80, 78, 71]);
  });
  it('the pasted prompt leaves out the base64 icon but stays a loadable spec', () => {
    const prompt = buildPrompt(branded(), 'inline', '');
    expect(prompt).not.toContain(PNG_B64);
    expect(prompt).toContain('Ask me for them');
    const json = prompt.slice(prompt.indexOf('<ui-spec.json>') + 14, prompt.indexOf('</ui-spec.json>'));
    const r = loadProject(json);
    expect(r.ok && r.project.theme?.accent).toBe('#ff8a3d');
  });
});

describe('store', () => {
  it('sets, resets and removes colors and the icon (undoable)', () => {
    const s = useProject();
    s.replaceProject(load(raw()));
    s.updateTheme({ accent: '#ff8a3d' });
    s.updateTheme({ primary: '#1565c0' });
    expect(s.project.theme).toEqual({ accent: '#ff8a3d', primary: '#1565c0' });
    s.updateTheme({ accent: undefined, primary: undefined });
    expect('theme' in s.project).toBe(false);
    s.undo();
    expect(s.project.theme).toEqual({ accent: '#ff8a3d', primary: '#1565c0' });

    s.updateEntry({ iconImage: ICON });
    expect(s.project.entry.iconImage).toBe(ICON);
    s.updateEntry({ iconImage: undefined });
    expect('iconImage' in s.project.entry).toBe(false);
  });
});

describe('home banner', () => {
  const screen = (p: Project, id: string) => p.screens.find((s) => s.id === id)!;
  const withBanner = (banner: object, extra: object = {}) => load({ ...raw(), ...extra, banner });

  it('shows on the home screen only by default, on every pane with showOn: all, never on dialogs', () => {
    const p = withBanner({ left: 'icon' });
    const home = p.entry.openScreen;
    const other = p.screens.find((s) => s.id !== home)!;
    expect(bannerFor(p, screen(p, home))).not.toBeNull();
    expect(bannerFor(p, other)).toBeNull();
    const all = withBanner({ showOn: 'all' });
    expect(bannerFor(all, other)).toEqual(other.surface === 'dialog' ? null : expect.objectContaining({ title: all.meta.name }));
    expect(bannerFor(all, { ...other, surface: 'dialog' })).toBeNull();
  });

  it('resolves logos, title and readable colors', () => {
    const p = withBanner({ left: 'icon', right: ICON, title: 'County EMS', subtitle: 'Unit 7', align: 'center', background: '#ffeb3b' });
    const look = bannerFor(p, screen(p, p.entry.openScreen))!;
    expect(look).toMatchObject({ title: 'County EMS', subtitle: 'Unit 7', left: null, right: ICON, align: 'center', bg: '#ffeb3b', fg: '#000000' });
    // icon not uploaded → placeholder tile, and a plain-language warning
    const r = loadProject({ ...raw(), banner: { left: 'icon' } });
    expect(r.ok && r.issues.find((i) => i.path === '/banner/left')?.message).toMatch(/no icon picture is uploaded/);
    // background falls back to the title bar color
    const q = withBanner({}, { theme: { header: '#13294b' } });
    expect(bannerFor(q, screen(q, q.entry.openScreen))).toMatchObject({ bg: '#13294b', fg: '#ffffff', title: q.meta.name });
  });

  it('rejects bad logos and options', () => {
    expect(loadProject({ ...raw(), banner: { left: 'logo.png' } }).ok).toBe(false);
    expect(loadProject({ ...raw(), banner: { align: 'right' } }).ok).toBe(false);
    expect(loadProject({ ...raw(), banner: { background: 'navy' } }).ok).toBe(false);
  });

  it('handoff describes it and ships its own-picture logos; the pasted prompt omits their base64', () => {
    const p = withBanner({ left: ICON, right: 'icon', subtitle: 'Unit 7' }, { entry: { ...raw().entry, iconImage: ICON } });
    const md = buildHandoff(p, { generatedAt: '2026-11-24' });
    expect(md).toContain('**Home banner**');
    expect(md).toContain('left: `assets/banner-left.png`; right: the launch icon (`assets/icon.png`)');
    expect(md).toContain('"Unit 7"');
    const files = handoffFiles(p, '2026-11-24', [], false);
    expect(Buffer.from(files['assets/banner-left.png'] as Uint8Array).toString('base64')).toBe(PNG_B64);
    expect(files['assets/banner-right.png']).toBeUndefined();
    const prompt = buildPrompt(p, 'inline', '');
    expect(prompt).not.toContain(PNG_B64);
    const json = prompt.slice(prompt.indexOf('<ui-spec.json>') + 14, prompt.indexOf('</ui-spec.json>'));
    expect(loadProject(json).ok).toBe(true);
  });

  it('banner text is spell-checked and fixable', () => {
    const p = withBanner({ title: 'Countty EMS', subtitle: 'Unit 7' });
    const spots = collectText(p).filter((t) => t.loc.k === 'banner');
    expect(spots.map((t) => t.where)).toEqual(['Banner › Title', 'Banner › Second line']);
    setText(p, spots[0]!.loc, 'County EMS');
    expect(p.banner?.title).toBe('County EMS');
  });

  it('store: turn on, change, remove, undo', () => {
    const s = useProject();
    s.replaceProject(load(raw()));
    s.updateBanner({ left: 'icon' });
    s.updateBanner({ right: 'icon', left: undefined });
    expect(s.project.banner).toEqual({ right: 'icon' });
    s.updateBanner(null);
    expect('banner' in s.project).toBe(false);
    s.undo();
    expect(s.project.banner).toEqual({ right: 'icon' });
  });
});
