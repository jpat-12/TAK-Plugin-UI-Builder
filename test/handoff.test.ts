import { readFileSync } from 'node:fs';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { buildHandoff, buildPrompt } from '../src/export/handoff';
import { handoffFiles, mockupPath, slugOf } from '../src/export/package';
import { loadProject } from '../src/spec/load';
import { walk } from '../src/spec/tree';
import type { Project } from '../src/spec/types';
import { TEMPLATES } from '../src/templates';
import { TARGET_NAMES } from '../src/spec/validate';

const load = (raw: unknown): Project => {
  const r = loadProject(raw);
  if (!r.ok) throw new Error('bad fixture');
  return r.project;
};
const eventCad = load(JSON.parse(readFileSync('test/fixtures/event-cad.takui.json', 'utf8')));
const DATE = '2026-11-10';

describe('HANDOFF.md', () => {
  it('matches the committed snapshot for Event CAD (review diffs when changing the generator)', async () => {
    await expect(buildHandoff(eventCad, { generatedAt: DATE, mockups: [{ target: 'atak', screen: 'main', file: 'mockups/atak-main.png' }] }))
      .toMatchFileSnapshot('__snapshots__/event-cad.HANDOFF.md');
  });

  for (const t of TEMPLATES) {
    it(`${t.name}: mentions every component, data field and action`, () => {
      const p = load(t.raw);
      const md = buildHandoff(p, { generatedAt: DATE });
      for (const s of p.screens) for (const n of walk(s.root)) expect(md).toContain('`#' + n.id + '`');
      for (const f of p.state) expect(md).toContain('`' + f.key + '`');
      for (const a of p.actions) {
        expect(md).toContain('`' + a.id + '`');
        expect(md).toContain(a.intent);
      }
      for (const target of p.meta.targets) expect(md).toContain(`Builds and loads in ${TARGET_NAMES[target]}`);
    });
  }

  it('includes designer notes, starters and per-platform caveats', () => {
    const p = structuredClone(eventCad);
    p.handoff = { notes: 'Target ATAK 5.6.\nAsk Jon about the server.', starters: { atak: 'TAK-PluginSuite-IndianaUniversity/ATAK5.6-Template' } };
    const md = buildHandoff(p, { generatedAt: DATE });
    expect(md).toContain('> Target ATAK 5.6.');
    expect(md).toContain('> Ask Jon about the server.');
    expect(md).toContain('**Start from:** `TAK-PluginSuite-IndianaUniversity/ATAK5.6-Template`');
    // table is "approx" on ATAK in the catalog
    expect(md).toMatch(/Components that need extra care on ATAK:[\s\S]*\*\*Table\*\* \(`#unit-table`\)/);
  });

  it('components hidden on a platform are excluded from that platform\'s caveats and called out', () => {
    const p = structuredClone(eventCad);
    const table = p.screens[0]!.root.children[1]!;
    (table as any).children[0].targetOverrides = { atak: { hidden: true } };
    const md = buildHandoff(p, { generatedAt: DATE });
    expect(md).not.toMatch(/extra care on ATAK:[\s\S]*#unit-table[\s\S]*### CloudTAK/);
    expect(md).toContain('**not shown on ATAK**');
  });

  it('flags secret-looking fields in the checklist', () => {
    const md = buildHandoff(load(TEMPLATES.find((t) => t.id === 'server-connect')!.raw), { generatedAt: DATE });
    expect(md).toMatch(/Secrets \(`apiKey`\) are never logged/);
  });
});

describe('prompts', () => {
  it('inline prompt embeds HANDOFF.md and a parseable spec', () => {
    const md = buildHandoff(eventCad, { generatedAt: DATE });
    const prompt = buildPrompt(eventCad, 'inline', md);
    expect(prompt).toContain('<HANDOFF.md>');
    const json = prompt.slice(prompt.indexOf('<ui-spec.json>') + 14, prompt.indexOf('</ui-spec.json>'));
    expect(loadProject(json).ok).toBe(true);
  });
  it('zip prompt points at the files', () => {
    expect(buildPrompt(eventCad, 'zip')).toMatch(/read HANDOFF\.md first/);
  });
});

describe('package', () => {
  it('has HANDOFF.md, ui-spec.json, PROMPT.md and one PNG per mockup, and zips', async () => {
    const png = new Uint8Array([137, 80, 78, 71]);
    const bare = handoffFiles(eventCad, DATE, [{ target: 'atak', screen: 'main', png }], false);
    expect(Object.keys(bare).sort()).toEqual(['HANDOFF.md', 'PROMPT.md', mockupPath('atak', 'main'), 'ui-spec.json'].sort());
    expect(bare['HANDOFF.md']).not.toContain('## Generated scaffold');

    const files = handoffFiles(eventCad, DATE, [{ target: 'atak', screen: 'main', png }]);
    expect(Object.keys(files)).toContain('scaffold/atak/app/src/main/java/org/example/eventcad/ui/MainViews.java');
    expect(Object.keys(files)).toContain('scaffold/cloudtak/plugin/components/MainPanel.vue');
    expect(Object.keys(files).some((k) => k.startsWith('scaffold/wintak/'))).toBe(false); // not a target of this project
    expect(files['HANDOFF.md']).toContain('## Generated scaffold');
    expect(files['HANDOFF.md']).toContain('8. **Start from the generated scaffold**');
    expect(files['HANDOFF.md']).toContain('](mockups/atak-main.png)');
    expect(loadProject(files['ui-spec.json'] as string).ok).toBe(true);

    const zip = new JSZip();
    for (const [k, v] of Object.entries(files)) zip.file(`${slugOf(eventCad)}-handoff/${k}`, v);
    const reread = await JSZip.loadAsync(await zip.generateAsync({ type: 'uint8array' }));
    expect(Object.keys(reread.files)).toContain('event-cad-handoff/mockups/atak-main.png');
  });
});
