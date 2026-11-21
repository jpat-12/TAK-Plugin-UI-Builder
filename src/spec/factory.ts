// Creates new, valid-by-default pieces of a Project: fresh projects, nodes dropped from the
// palette, unique ids. "Valid by default" = a freshly dropped component never shows a
// required-prop error, so a new user's first impression isn't a wall of red.

import { componentSpec } from './catalog';
import { SPEC_VERSION, type ContainerType, type Node, type Project, type Props } from './types';
import { walk } from './tree';

/** `base`, else `base-2`, `base-3`, ... — first one not in `taken` */
export function uniqueId(base: string, taken: Set<string>): string {
  const clean = base.replace(/[^a-zA-Z0-9_-]/g, '-').replace(/^[^a-zA-Z]+/, '') || 'item';
  if (!taken.has(clean)) return clean;
  for (let i = 2; ; i++) if (!taken.has(`${clean}-${i}`)) return `${clean}-${i}`;
}

/** kebab/space text → camelCase identifier (state keys must be code-safe) */
export function toIdent(s: string): string {
  const words = s.replace(/[^a-zA-Z0-9]+/g, ' ').trim().split(' ').filter(Boolean);
  const out = words.map((w, i) => (i === 0 ? w.toLowerCase() : w[0]!.toUpperCase() + w.slice(1).toLowerCase())).join('');
  return /^[a-zA-Z]/.test(out) ? out : `field${out}`;
}

export function defaultProps(kind: 'container' | 'element', type: string): Props {
  const spec = componentSpec(kind, type);
  const props: Props = {};
  if (!spec) return props;
  for (const [name, ps] of Object.entries(spec.props)) {
    // only fill what's required, plus a few that make the preview read naturally
    if (ps.kind === 'string' && ('required' in ps && ps.required)) props[name] = ps.default ?? spec.label;
  }
  if (type === 'section') props.title = 'Section';
  if (type === 'label') props.text = 'Text';
  if (type === 'icon-button') { props.icon = 'star'; props.tooltip = 'Icon button'; }
  return props;
}

/** New node with a unique id; ids added to `taken` so batch creation stays unique */
export function createNode(kind: 'container' | 'element', type: string, taken: Set<string>): Node {
  const id = uniqueId(type, taken);
  taken.add(id);
  if (kind === 'element') return { id, kind, type, props: defaultProps(kind, type) };
  const node: Node = { id, kind, type: type as ContainerType, props: defaultProps(kind, type), children: [] };
  if (type === 'tabs') {
    // tabs must have titled children (validate.ts) — start with two so it reads as tabs
    for (const t of ['Tab 1', 'Tab 2']) {
      const tab = createNode('container', 'section', taken);
      tab.props.title = t;
      node.children.push(tab);
    }
  }
  return node;
}

/** Deep copy with every node id replaced by a fresh unique one */
export function cloneWithNewIds(n: Node, taken: Set<string>): Node {
  const copy = structuredClone(n) as Node;
  for (const x of walk(copy)) {
    x.id = uniqueId(x.id.replace(/-\d+$/, ''), taken);
    taken.add(x.id);
  }
  return copy;
}

export function newProject(): Project {
  return {
    spec: SPEC_VERSION,
    meta: { name: 'My Plugin', packageId: 'org.example.myplugin', version: '0.0.1', description: '', targets: ['atak'] },
    state: [],
    actions: [],
    entry: { label: 'My Plugin', openScreen: 'main' },
    screens: [{
      id: 'main',
      title: 'My Plugin',
      surface: 'pane',
      root: { id: 'main-root', kind: 'container', type: 'stack', props: { gap: 8 }, children: [] },
    }],
  };
}
