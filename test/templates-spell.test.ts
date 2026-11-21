import { readFileSync } from 'node:fs';
import Typo from 'typo-js';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import { loadProject } from '../src/spec/load';
import { locate } from '../src/spec/tree';
import type { Project } from '../src/spec/types';
import { collectText, setText } from '../src/spell/text';
import { findMisspellings, replaceWord, tokenize } from '../src/spell/words';
import { useProject } from '../src/store/project';
import { TEMPLATES } from '../src/templates';

const DICT = 'node_modules/typo-js/dictionaries/en_US/en_US';
const typo = new Typo('en_US', readFileSync(`${DICT}.aff`, 'utf8'), readFileSync(`${DICT}.dic`, 'utf8'));
const check = (p: Project) => findMisspellings(collectText(p), (w) => typo.check(w), p.meta.spellingAllow ?? []);

const load = (raw: unknown) => {
  const r = loadProject(raw);
  if (!r.ok) throw new Error(r.issues.map((i) => i.message).join('\n'));
  return r;
};

describe('templates', () => {
  for (const t of TEMPLATES) {
    it(`${t.name}: loads with no errors, warnings or spelling issues`, () => {
      const r = load(t.raw);
      expect(r.issues).toEqual([]);
      expect(check(r.project).map((m) => `${m.word} (${m.spot.where})`)).toEqual([]);
    });
  }
  it('template ids and package ids are unique', () => {
    expect(new Set(TEMPLATES.map((t) => t.id)).size).toBe(TEMPLATES.length);
    const pkgs = TEMPLATES.map((t) => load(t.raw).project.meta.packageId);
    expect(new Set(pkgs).size).toBe(pkgs.length);
  });
});

describe('spell: tokenize', () => {
  it('skips acronyms, identifiers, refs, urls and numbers', () => {
    const words = tokenize("Send MGRS to myStatus via $item.title #send-btn https://x.org/abc P1 team's 3rd GeoChat").map((t) => t.word);
    expect(words).toEqual(['Send', 'to', 'via', 'team']);
  });
});

describe('spell: findMisspellings', () => {
  const p = load(TEMPLATES[0]!.raw).project;
  it('finds a typo in a button label and in an action intent', () => {
    const q = structuredClone(p);
    locate(q, 'me-send')!.node.props.text = 'Updtae status';
    q.actions[0]!.intent = 'Brodcast my status';
    const words = check(q).map((m) => m.word);
    expect(words).toEqual(expect.arrayContaining(['Updtae', 'Brodcast']));
  });
  it('TAK vocabulary and the project dictionary are accepted', () => {
    const q = structuredClone(p);
    locate(q, 'me-send')!.node.props.text = 'Send CoT to callsign via GeoChat and Zulutown';
    expect(check(q).map((m) => m.word)).toEqual(['Zulutown']);
    q.meta.spellingAllow = ['zulutown'];
    expect(check(q)).toEqual([]);
  });
  it('noSpell props (icon names, columns) are not checked', () => {
    const texts = collectText(load(TEMPLATES[3]!.raw).project).map((s) => s.text);
    expect(texts).not.toContain('quantity'); // table column key
  });
});

describe('spell: fixing', () => {
  it('replaceWord keeps a leading capital and refuses stale offsets', () => {
    expect(replaceWord('Updtae status', 0, 'Updtae', 'update')).toBe('Update status');
    expect(replaceWord('Changed text', 0, 'Updtae', 'update')).toBe('Changed text');
  });
  it('setText writes back to every kind of location', () => {
    const q = structuredClone(load(TEMPLATES[2]!.raw).project);
    for (const spot of collectText(q)) setText(q, spot.loc, 'X');
    expect(collectText(q).every((s) => s.text === 'X')).toBe(true);
  });
  it('store.fixSpelling replaces just the word, undoably', () => {
    setActivePinia(createPinia());
    const s = useProject();
    const q = structuredClone(load(TEMPLATES[0]!.raw).project);
    locate(q, 'me-send')!.node.props.text = 'Updtae status';
    s.replaceProject(q);
    const m = findMisspellings(collectText(s.project), (w) => typo.check(w))[0]!;
    s.fixSpelling(m, 'update');
    expect(locate(s.project, 'me-send')!.node.props.text).toBe('Update status');
    s.undo();
    expect(locate(s.project, 'me-send')!.node.props.text).toBe('Updtae status');
    s.allowWord('Updtae');
    expect(s.project.meta.spellingAllow).toEqual(['updtae']);
  });
});

describe('gap fixes: renames carry references', () => {
  beforeEach(() => setActivePinia(createPinia()));
  const store = (raw: unknown) => { const s = useProject(); s.replaceProject(load(raw).project); return s; };

  it('renaming a list item field rewrites $item binds and table columns', () => {
    const s = store(TEMPLATES.find((t) => t.id === 'status-board')!.raw);
    expect(s.renameFieldAt(['team', 'status'], 'state')).toBe(true);
    expect(locate(s.project, 'team-badge')!.node.bind).toBe('$item.state');
    expect(s.issues).toEqual([]);

    const r = store(TEMPLATES.find((t) => t.id === 'resource-request')!.raw);
    expect(r.renameFieldAt(['myRequests', 'quantity'], 'qty')).toBe(true);
    expect(locate(r.project, 'mine-table')!.node.props.columns).toEqual(['item', 'qty', 'status']);
  });

  it('item-field rename only touches the list it belongs to', () => {
    // resource-request has a top-level "item" AND a myRequests item field "item"
    const r = store(TEMPLATES.find((t) => t.id === 'resource-request')!.raw);
    r.renameFieldAt(['myRequests', 'item'], 'what');
    expect(locate(r.project, 'item-input')!.node.bind).toBe('item');
    expect(locate(r.project, 'mine-table')!.node.props.columns).toEqual(['what', 'quantity', 'status']);
  });

  it('renaming a list rewrites the list container bind', () => {
    const s = store(TEMPLATES.find((t) => t.id === 'status-board')!.raw);
    s.renameFieldAt(['team'], 'crew');
    expect(locate(s.project, 'team-list')!.node.bind).toBe('crew');
    expect(locate(s.project, 'team-badge')!.node.bind).toBe('$item.status');
    expect(s.issues).toEqual([]);
  });

  it('renaming an option value rewrites show-when values and the default', () => {
    const s = store(TEMPLATES.find((t) => t.id === 'server-connect')!.raw);
    const i = s.project.state.find((f) => f.key === 'connection')!.options!.findIndex((o) => o.value === 'connected');
    expect(s.renameOptionAt(['connection'], i, 'online')).toBe(true);
    expect(locate(s.project, 'disconnect-btn')!.node.visibleWhen?.value).toBe('online');
    expect(locate(s.project, 'connect-btn')!.node.visibleWhen?.value).toBe('online');
    expect(s.issues).toEqual([]);
    const d = s.project.state.find((f) => f.key === 'connection')!;
    s.renameOptionAt(['connection'], 0, 'offline');
    expect(d.default ?? s.project.state.find((f) => f.key === 'connection')!.default).toBe('offline');
  });
});

describe('gap fixes: keyboard/touch reordering', () => {
  beforeEach(() => setActivePinia(createPinia()));
  it('nudge, indent into the block above, outdent back out', () => {
    const s = useProject();
    s.replaceProject(load(TEMPLATES.find((t) => t.id === 'team-checkin')!.raw).project);
    const kids = () => s.screen.root.children.map((c) => c.id);
    expect(kids()).toEqual(['answer-section', 'lead-section', 'lead-toggle']);
    s.nudge('lead-toggle', -1);
    expect(kids()).toEqual(['answer-section', 'lead-toggle', 'lead-section']);
    expect(s.canIndent('lead-toggle')).toBe(true);
    s.indent('lead-toggle');
    expect(locate(s.project, 'lead-toggle')!.parent!.id).toBe('answer-section');
    s.outdent('lead-toggle');
    expect(kids()).toEqual(['answer-section', 'lead-toggle', 'lead-section']);
    expect(s.canOutdent('answer-section')).toBe(false); // already top level
  });
});
