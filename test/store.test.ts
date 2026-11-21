import { readFileSync } from 'node:fs';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import { cloneWithNewIds, createNode, toIdent, uniqueId } from '../src/spec/factory';
import { loadProject } from '../src/spec/load';
import { allNodeIds, listScope, locate } from '../src/spec/tree';
import type { ContainerNode, Project } from '../src/spec/types';
import { useProject } from '../src/store/project';

const fixture = (name: string) => {
  const r = loadProject(readFileSync(`test/fixtures/${name}`, 'utf8'));
  if (!r.ok) throw new Error('fixture failed to load');
  return r.project;
};

function storeWith(p: Project) {
  const s = useProject();
  s.replaceProject(p);
  return s;
}
const rootIds = (s: ReturnType<typeof useProject>) => s.screen.root.children.map((c) => c.id);

beforeEach(() => setActivePinia(createPinia()));

describe('factory', () => {
  it('uniqueId suffixes until free', () => {
    expect(uniqueId('button', new Set())).toBe('button');
    expect(uniqueId('button', new Set(['button', 'button-2']))).toBe('button-3');
  });
  it('toIdent makes code-safe camelCase', () => {
    expect(toIdent('Floor / section')).toBe('floorSection');
    expect(toIdent('3 things')).toBe('field3Things');
  });
  it('new nodes never start with required-prop errors', () => {
    const s = useProject();
    for (const t of ['button', 'heading', 'checkbox', 'icon-button', 'image', 'empty-state', 'collapsible', 'tabs']) {
      const kind = ['collapsible', 'tabs'].includes(t) ? 'container' : 'element';
      s.addNode(kind, t, s.screen.root.id, 99);
    }
    expect(s.issues.filter((i) => i.severity === 'error' && /needs a/.test(i.message))).toEqual([]);
  });
  it('tabs start with titled tabs so they validate', () => {
    const tabs = createNode('container', 'tabs', new Set()) as ContainerNode;
    expect(tabs.children.map((c) => c.props.title)).toEqual(['Tab 1', 'Tab 2']);
  });
  it('cloneWithNewIds gives every node a fresh id', () => {
    const p = fixture('event-cad.takui.json');
    const taken = allNodeIds(p);
    const copy = cloneWithNewIds(p.screens[0]!.root, taken);
    const before = allNodeIds(fixture('event-cad.takui.json'));
    expect([...allNodeIds({ ...p, screens: [{ ...p.screens[0]!, root: copy as ContainerNode }] })].some((id) => before.has(id))).toBe(false);
  });
});

describe('tree', () => {
  it('listScope finds the enclosing list item fields', () => {
    const p = fixture('event-cad.takui.json');
    const at = locate(p, 'incident-title')!;
    expect(listScope(p, at.ancestors)?.key).toBe('incidents');
    expect(listScope(p, locate(p, 'me-callsign')!.ancestors)).toBeUndefined();
  });
});

describe('store mutations', () => {
  it('addNode inserts at the index and selects it', () => {
    const s = storeWith(fixture('hello-status.takui.json'));
    const id = s.addNode('element', 'divider', s.screen.root.id, 1)!;
    expect(rootIds(s)[1]).toBe(id);
    expect(s.selectedId).toBe(id);
  });

  it('moveNode within the same list accounts for the removed slot', () => {
    const s = storeWith(fixture('hello-status.takui.json'));
    // move "title" (index 0) to just before "send" (slot index 5)
    s.moveNode('title', s.screen.root.id, 5);
    expect(rootIds(s)).toEqual(['me', 'status-badge', 'status-pick', 'note-input', 'title', 'send']);
  });

  it('a container cannot be dropped into itself or its children', () => {
    const s = storeWith(fixture('event-cad.takui.json'));
    expect(s.canMove('tab-incidents', 'incident-row')).toBe(false);
    expect(s.canMove('tab-incidents', 'tab-incidents')).toBe(false);
    expect(s.canMove('incident-title', 'tab-units')).toBe(true);
    expect(s.canMove('main-tabs', 'tab-units')).toBe(false); // screen root
  });

  it('undo/redo round-trips, and typing coalesces into one step', () => {
    const s = storeWith(fixture('hello-status.takui.json'));
    s.setProp('send', 'text', 'S');
    s.setProp('send', 'text', 'Se');
    s.setProp('send', 'text', 'Send!');
    s.removeNode('me');
    s.undo();
    expect(rootIds(s)).toContain('me');
    s.undo();
    expect(locate(s.project, 'send')!.node.props.text).toBe('Send');
    s.redo();
    expect(locate(s.project, 'send')!.node.props.text).toBe('Send!');
  });

  it('deleting the selection selects its parent', () => {
    const s = storeWith(fixture('hello-status.takui.json'));
    s.select('send');
    s.removeNode('send');
    expect(s.selectedId).toBe(s.screen.root.id);
  });

  it('renaming a data field rewrites binds and conditions', () => {
    const s = storeWith(fixture('event-cad.takui.json'));
    expect(s.renameStateKey('isDispatcher', 'dispatcherMode')).toBe(true);
    expect(locate(s.project, 'set-dispatcher')!.node.bind).toBe('dispatcherMode');
    expect(locate(s.project, 'incidents-toolbar')!.node.visibleWhen?.key).toBe('dispatcherMode');
    expect(s.issues).toEqual([]);
    expect(s.renameStateKey('dispatcherMode', 'myStatus')).toBe(false); // taken
    expect(s.renameStateKey('dispatcherMode', '9lives')).toBe(false); // not an identifier
  });

  it('renaming an action rewrites event wiring; renaming a screen rewrites entry + navigate', () => {
    const s = storeWith(fixture('event-cad.takui.json'));
    s.renameAction('open-new-incident', 'new-incident-open');
    expect(locate(s.project, 'new-incident-btn')!.node.on?.click).toBe('new-incident-open');
    s.renameScreen('new-incident', 'incident-form');
    s.renameScreen('main', 'home');
    expect(s.project.entry.openScreen).toBe('home');
    expect(s.project.actions.find((a) => a.id === 'new-incident-open')!.params?.screen).toBe('incident-form');
    expect(s.issues).toEqual([]);
  });

  it('a new action with no description shows a plain-language error', () => {
    const s = storeWith(fixture('hello-status.takui.json'));
    const id = s.addAction({ id: 'x', label: 'Do it', intent: '', kind: 'custom' });
    s.setEvent('send', 'click', id);
    expect(s.issues.some((i) => i.ref === id && /needs a description/.test(i.message))).toBe(true);
  });

  it('renaming the plugin carries along titles that echoed the old name, typed one key at a time', () => {
    const t = useProject();
    t.replaceProject({ ...t.project, meta: { ...t.project.meta, name: 'My Plugin' } });
    for (const n of ['My Plugi', 'My Plug', 'Shift']) t.updateMeta({ name: n });
    expect(t.screen.title).toBe('Shift');
    expect(t.project.entry.label).toBe('Shift');
  });

  it('the last target and the last screen cannot be removed', () => {
    const s = storeWith(fixture('hello-status.takui.json'));
    s.toggleTarget('atak');
    expect(s.project.meta.targets).toEqual(['atak']);
    s.removeScreen('main');
    expect(s.project.screens).toHaveLength(1);
  });

  it('insertionPoint: inside a selected container, after a selected element', () => {
    const s = storeWith(fixture('hello-status.takui.json'));
    s.select('note-input');
    expect(s.insertionPoint()).toEqual({ parentId: 'main-root', index: 5 });
    s.select('main-root');
    expect(s.insertionPoint()).toEqual({ parentId: 'main-root', index: 6 });
  });
});
