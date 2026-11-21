// Every piece of human-readable text in a Project, with an address to read/write it back.
// The spell checker walks these; "Fix" writes through setText. Ids, keys, option VALUES and
// noSpell props are excluded: they're code identifiers, not words a user reads.

import { componentSpec } from '../spec/catalog';
import { fieldAt, locate, walk } from '../spec/tree';
import type { Project, StateField } from '../spec/types';

export type TextLoc =
  | { k: 'prop'; node: string; prop: string; i?: number }
  | { k: 'screen'; screen: string }
  | { k: 'meta'; field: 'name' | 'description' }
  | { k: 'entry' }
  | { k: 'field-label'; path: string[] }
  | { k: 'field-desc'; path: string[] }
  | { k: 'option'; path: string[]; i: number }
  | { k: 'action-label'; id: string }
  | { k: 'action-intent'; id: string };

export interface TextSpot {
  loc: TextLoc;
  text: string;
  /** Where, in words: 'Button "send" › Text' */
  where: string;
  /** node/screen/action id for jumping the inspector, when there is one */
  ref?: string;
}

export function collectText(p: Project): TextSpot[] {
  const out: TextSpot[] = [];
  const add = (loc: TextLoc, text: string | undefined, where: string, ref?: string) => {
    if (text && text.trim()) out.push({ loc, text, where, ref });
  };

  add({ k: 'meta', field: 'name' }, p.meta.name, 'Plugin name');
  add({ k: 'meta', field: 'description' }, p.meta.description, 'Plugin description');
  add({ k: 'entry' }, p.entry.label, 'Launch button label');

  for (const s of p.screens) {
    add({ k: 'screen', screen: s.id }, s.title, `Screen "${s.id}" › Title`, s.id);
    for (const n of walk(s.root)) {
      const spec = componentSpec(n.kind, n.type);
      if (!spec) continue;
      for (const [name, ps] of Object.entries(spec.props)) {
        if ((ps.kind !== 'string' && ps.kind !== 'stringList') || ps.noSpell) continue;
        const v = n.props[name];
        const where = `${spec.label} "${n.id}" › ${ps.label}`;
        if (typeof v === 'string') add({ k: 'prop', node: n.id, prop: name }, v, where, n.id);
        else if (Array.isArray(v)) v.forEach((x, i) => add({ k: 'prop', node: n.id, prop: name, i }, x, where, n.id));
      }
    }
  }

  const fields = (list: StateField[], prefix: string[]) => {
    for (const f of list) {
      const path = [...prefix, f.key];
      const name = path.join('.');
      add({ k: 'field-label', path }, f.label, `Data field "${name}" › Label`);
      add({ k: 'field-desc', path }, f.description, `Data field "${name}" › Notes`);
      f.options?.forEach((o, i) => add({ k: 'option', path, i }, o.label, `Data field "${name}" › option`));
      if (f.itemFields) fields(f.itemFields, path);
    }
  };
  fields(p.state, []);

  for (const a of p.actions) {
    add({ k: 'action-label', id: a.id }, a.label, `Action "${a.id}" › Name`, a.id);
    add({ k: 'action-intent', id: a.id }, a.intent, `Action "${a.id}" › What it does`, a.id);
  }
  return out;
}

/** Write text back to a location (mutates p — call inside the store's mutate) */
export function setText(p: Project, loc: TextLoc, value: string): void {
  switch (loc.k) {
    case 'prop': {
      const n = locate(p, loc.node)?.node;
      if (!n) return;
      const v = n.props[loc.prop];
      if (loc.i !== undefined && Array.isArray(v)) v[loc.i] = value;
      else n.props[loc.prop] = value;
      return;
    }
    case 'screen': { const s = p.screens.find((x) => x.id === loc.screen); if (s) s.title = value; return; }
    case 'meta': p.meta[loc.field] = value; return;
    case 'entry': p.entry.label = value; return;
    case 'field-label': { const f = fieldAt(p, loc.path); if (f) f.label = value; return; }
    case 'field-desc': { const f = fieldAt(p, loc.path); if (f) f.description = value; return; }
    case 'option': { const o = fieldAt(p, loc.path)?.options?.[loc.i]; if (o) o.label = value; return; }
    case 'action-label': { const a = p.actions.find((x) => x.id === loc.id); if (a) a.label = value; return; }
    case 'action-intent': { const a = p.actions.find((x) => x.id === loc.id); if (a) a.intent = value; return; }
  }
}
