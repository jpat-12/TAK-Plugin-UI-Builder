// Assembles the handoff zip (PLAN.md §3). Pure apart from JSZip: mockup PNG bytes are
// rendered by the UI (ExportDialog) and passed in, so this file has no DOM dependency.

import JSZip from 'jszip';
import { walk } from '../spec/tree';
import type { Project, Screen, Target } from '../spec/types';
import { emitScaffold } from '../emit';
import { buildHandoff, buildPrompt, ICON_FILE, type MockupRef } from './handoff';

/** tab: index into the screen's first tabs block (tabbed screens get one image per tab) */
export interface RenderedMockup { target: Target; screen: string; png: Uint8Array; tab?: number; label?: string }

export function slugOf(p: Project): string {
  return (p.meta.name || 'plugin').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'plugin';
}

export const mockupPath = (target: Target, screen: string, tab?: number) =>
  `mockups/${target}-${screen}${tab === undefined ? '' : `-tab${tab + 1}`}.png`;

/** Everything in the zip, keyed by path inside the top folder */
export function handoffFiles(p: Project, generatedAt: string, mockups: RenderedMockup[], withScaffold = true): Record<string, string | Uint8Array> {
  const refs: MockupRef[] = mockups.map((m) => ({ target: m.target, screen: m.screen, file: mockupPath(m.target, m.screen, m.tab), label: m.label }));
  const scaffold = withScaffold ? emitScaffold(p) : {};
  const files: Record<string, string | Uint8Array> = {
    'HANDOFF.md': buildHandoff(p, { generatedAt, mockups: refs, scaffold: Object.keys(scaffold) as Target[] }),
    'ui-spec.json': JSON.stringify(p, null, 2) + '\n',
    'PROMPT.md': buildPrompt(p, 'zip'),
  };
  if (p.entry.iconImage) files[ICON_FILE] = dataUrlBytes(p.entry.iconImage);
  for (const m of mockups) files[mockupPath(m.target, m.screen, m.tab)] = m.png;
  for (const [t, fm] of Object.entries(scaffold)) for (const [path, body] of Object.entries(fm ?? {})) files[`scaffold/${t}/${path}`] = body;
  return files;
}

function dataUrlBytes(url: string): Uint8Array {
  const bin = atob(url.slice(url.indexOf(',') + 1));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

export async function buildZip(p: Project, generatedAt: string, mockups: RenderedMockup[], withScaffold = true): Promise<Blob> {
  const zip = new JSZip();
  const dir = zip.folder(`${slugOf(p)}-handoff`)!;
  for (const [path, data] of Object.entries(handoffFiles(p, generatedAt, mockups, withScaffold))) dir.file(path, data);
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}

/** Tab titles of a screen's first tabs block: one mockup per tab. [] = no tabs, one image. */
export function tabsOf(screen: Screen): string[] {
  for (const n of walk(screen.root)) {
    if (n.kind === 'container' && n.type === 'tabs') return n.children.map((c, i) => String(c.props.title || `Tab ${i + 1}`));
  }
  return [];
}
