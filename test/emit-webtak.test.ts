// Runs every template's WebTAK scaffold in jsdom: import the generated modules, mount each
// panel, render, then act like a user (type into bound text inputs, click wired buttons) and
// check that state changes and actions fire. Stronger than a syntax check: it executes the code.

import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { JSDOM } from 'jsdom';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { camel } from '../src/emit/common';
import { emitWebtak } from '../src/emit/webtak';
import { loadProject } from '../src/spec/load';
import { walk } from '../src/spec/tree';
import type { Project } from '../src/spec/types';
import { TEMPLATES } from '../src/templates';

const ROOT = resolve('.emit-tmp', 'webtak');
const g = globalThis as unknown as Record<string, unknown>;
let dom: JSDOM;

beforeAll(() => {
  dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', { url: 'http://localhost/' });
  for (const k of ['window', 'document', 'localStorage', 'HTMLElement', 'Event']) g[k] = k === 'window' ? dom.window : (dom.window as unknown as Record<string, unknown>)[k];
});
afterAll(() => { for (const k of ['window', 'document', 'localStorage', 'HTMLElement', 'Event']) delete g[k]; });

describe('WebTAK scaffold runs in a browser DOM', () => {
  rmSync(ROOT, { recursive: true, force: true });
  for (const t of TEMPLATES) {
    it(`${t.name}: mounts, renders, binds inputs, fires actions`, async () => {
      const r = loadProject(t.raw);
      if (!r.ok) throw new Error('bad template');
      const p: Project = r.project;
      const dir = join(ROOT, t.id);
      for (const [path, body] of Object.entries(emitWebtak(p))) {
        const full = join(dir, path);
        mkdirSync(dirname(full), { recursive: true });
        writeFileSync(full, body);
      }
      const src = join(dir, 'plugin', 'src');
      // each template has its own directory, so plain absolute paths never collide in the module cache
      const imp = (f: string) => import(/* @vite-ignore */ join(src, f));
      const { createState } = await imp('state.js');
      const { injectStyles } = await imp('styles.js');
      injectStyles(document);

      for (const s of p.screens) {
        const state = createState();
        const calls: string[] = [];
        const actions = new Proxy({}, { get: (_o, name: string) => () => { calls.push(name); } });
        const host = document.createElement('div');
        document.body.append(host);
        const mod = await imp(`panel-${s.id}.js`);
        const panel = mod[`mount${s.id.split(/[-_]/).map((w) => w[0]!.toUpperCase() + w.slice(1)).join('')}`](host, state, actions);
        expect(panel.root.isConnected).toBe(true);
        panel.render();

        for (const n of walk(s.root)) {
          // typing into a bound top-level text box writes state
          if ((n.type === 'text-input' || n.type === 'text-area') && n.bind && !n.bind.startsWith('$')) {
            const f = p.state.find((x) => x.key === n.bind);
            if (f?.type !== 'string') continue;
            const el = host.querySelector(`[data-id="${n.id}"]`);
            const input = (el?.matches('input, textarea') ? el : el?.querySelector('input, textarea')) as HTMLInputElement | null;
            expect(input, `#${n.id} input`).toBeTruthy();
            input!.value = 'typed';
            input!.dispatchEvent(new dom.window.Event('input'));
            expect(state[n.bind], `#${n.id} → state.${n.bind}`).toBe('typed');
          }
          // clicking a wired top-level button calls its action (skip ones hidden by show-when rules)
          if (n.type === 'button' && n.on?.click) {
            const el = host.querySelector(`[data-id="${n.id}"]`) as HTMLButtonElement | null;
            if (!el || el.closest('[hidden]')) continue;
            el.click();
            expect(calls, `#${n.id} click`).toContain(camel(n.on.click));
          }
        }
        host.remove();
      }
    });
  }
});
