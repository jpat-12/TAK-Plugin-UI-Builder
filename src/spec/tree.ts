// Pure read helpers over a Project's node trees. Mutations live in the store; this file
// only answers "where is X / what's around it" so the store, canvas and inspector agree.

import type { ContainerNode, Node, Project, Screen, StateField } from './types';

export interface Located {
  node: Node;
  screen: Screen;
  /** null only for a screen's root */
  parent: ContainerNode | null;
  index: number;
  /** root → parent, excluding the node itself */
  ancestors: ContainerNode[];
}

export function* walk(n: Node): Generator<Node> {
  yield n;
  if (n.kind === 'container') for (const c of n.children) yield* walk(c);
}

export function locate(p: Project, id: string): Located | undefined {
  for (const screen of p.screens) {
    const found = locateIn(screen.root, id, [], screen);
    if (found) return found;
  }
  return undefined;
}

function locateIn(n: Node, id: string, ancestors: ContainerNode[], screen: Screen): Located | undefined {
  if (n.id === id) {
    const parent = ancestors[ancestors.length - 1] ?? null;
    return { node: n, screen, parent, index: parent ? parent.children.indexOf(n) : 0, ancestors };
  }
  if (n.kind !== 'container') return undefined;
  const next = [...ancestors, n];
  for (const c of n.children) {
    const r = locateIn(c, id, next, screen);
    if (r) return r;
  }
  return undefined;
}

export function allNodeIds(p: Project): Set<string> {
  const ids = new Set<string>();
  for (const s of p.screens) for (const n of walk(s.root)) ids.add(n.id);
  return ids;
}

/** True if `id` is `n` or anywhere inside it — moving n into such a target would orphan it */
export function contains(n: Node, id: string): boolean {
  for (const x of walk(n)) if (x.id === id) return true;
  return false;
}

/**
 * The list item scope a node sits in: the itemFields of the nearest `list` ancestor, which
 * `$item.<field>` binds resolve against. Undefined outside any list.
 */
export function listScope(p: Project, ancestors: ContainerNode[]): StateField | undefined {
  for (let i = ancestors.length - 1; i >= 0; i--) {
    const a = ancestors[i]!;
    if (a.type === 'list' && a.bind) {
      const outer = listScope(p, ancestors.slice(0, i));
      const f = a.bind.startsWith('$item.')
        ? outer?.itemFields?.find((x) => x.key === a.bind!.slice(6))
        : p.state.find((x) => x.key === a.bind);
      return f?.type === 'list' ? f : undefined;
    }
  }
  return undefined;
}

/** Every node with its ancestors, across all screens — for rewrites that need list scope */
export function* walkWithAncestors(p: Project): Generator<{ node: Node; ancestors: ContainerNode[] }> {
  function* go(n: Node, ancestors: ContainerNode[]): Generator<{ node: Node; ancestors: ContainerNode[] }> {
    yield { node: n, ancestors };
    if (n.kind === 'container') for (const c of n.children) yield* go(c, [...ancestors, n]);
  }
  for (const s of p.screens) yield* go(s.root, []);
}

/** Resolve a bind / visibleWhen key to the field object it points at (identity matters to callers) */
export function resolveKey(p: Project, ancestors: ContainerNode[], key: string): StateField | undefined {
  if (key.startsWith('$item.')) return listScope(p, ancestors)?.itemFields?.find((f) => f.key === key.slice(6));
  return p.state.find((f) => f.key === key);
}

/**
 * A field addressed by key path from the top: ['incidents'] or ['incidents', 'priority'].
 * Each step after the first descends into the previous list's itemFields.
 */
export function fieldAt(p: Project, path: string[]): StateField | undefined {
  let f = p.state.find((x) => x.key === path[0]);
  for (const k of path.slice(1)) f = f?.itemFields?.find((x) => x.key === k);
  return f;
}
