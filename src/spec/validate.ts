// Semantic validation of a shape-valid Project against itself and the catalog.
//
// Errors   = the handoff would be wrong or the agent couldn't implement it (dangling refs,
//            wrong bind type). Export is blocked on these.
// Warnings = it'll work but deserves a look (target can't do it natively, unknown prop).
//
// Messages are written for non-coders (PLAN.md D5): say what's wrong in UI terms and
// where, not "invalid reference at $.screens[0]...".

import { componentSpec, type PropSpec } from './catalog';
import { contrast, PLATFORM_BG, UI_CONTRAST } from './color';
import { type Node, type Project, type StateField, type Target } from './types';

export interface Issue {
  severity: 'error' | 'warning';
  /** JSON-pointer-ish location, for jumping the inspector to the culprit */
  path: string;
  /** Node/screen/action id the issue belongs to, when there is one */
  ref?: string;
  message: string;
}

const ITEM_PREFIX = '$item.';

export function validateProject(p: Project): Issue[] {
  const issues: Issue[] = [];
  const err = (path: string, message: string, ref?: string) => issues.push({ severity: 'error', path, message, ref });
  const warn = (path: string, message: string, ref?: string) => issues.push({ severity: 'warning', path, message, ref });

  // ---- blanks (kept out of schema.ts so half-finished projects still save) ----
  if (!p.meta.name.trim()) err('/meta/name', 'The plugin needs a name.');
  if (!p.entry.label.trim()) err('/entry/label', "The plugin's launch button needs a label.");
  p.screens.forEach((s, i) => { if (!s.title.trim()) err(`/screens/${i}/title`, `Screen "${s.id}" needs a title.`, s.id); });
  p.actions.forEach((a, i) => {
    if (!a.label.trim()) err(`/actions/${i}/label`, `Action "${a.id}" needs a name.`, a.id);
    if (!a.intent.trim()) err(`/actions/${i}/intent`, `Action "${a.label || a.id}" needs a description of what it should do — that's what the coding agent builds from.`, a.id);
  });

  // ---- uniqueness ----
  const dupes = (items: string[], what: string, path: string) => {
    const seen = new Set<string>();
    for (const v of items) {
      if (seen.has(v)) err(path, `Two ${what} are both called "${v}". Names must be unique.`, v);
      seen.add(v);
    }
  };
  dupes(p.state.map((s) => s.key), 'data fields', '/state');
  dupes(p.actions.map((a) => a.id), 'actions', '/actions');
  dupes(p.screens.map((s) => s.id), 'screens', '/screens');

  const stateByKey = new Map(p.state.map((s) => [s.key, s]));
  const actionIds = new Set(p.actions.map((a) => a.id));
  const screenIds = new Set(p.screens.map((s) => s.id));

  // ---- state fields ----
  const checkField = (f: StateField, path: string) => {
    if (f.type === 'enum' && !f.options?.length) err(path, `Choice field "${f.key}" has no options.`, f.key);
    if (f.type !== 'enum' && f.options) warn(path, `"${f.key}" has options but isn't a choice field — they'll be ignored.`, f.key);
    if (f.type === 'list') {
      if (!f.itemFields?.length) err(path, `List "${f.key}" doesn't say what each item contains (add item fields).`, f.key);
      else {
        dupes(f.itemFields.map((i) => i.key), `fields in list "${f.key}"`, `${path}/itemFields`);
        f.itemFields.forEach((i, n) => checkField(i, `${path}/itemFields/${n}`));
      }
    }
    if (f.type === 'enum' && f.default != null && !f.options?.some((o) => o.value === f.default)) {
      err(path, `Default "${String(f.default)}" for "${f.key}" isn't one of its options.`, f.key);
    }
  };
  p.state.forEach((f, i) => checkField(f, `/state/${i}`));

  // ---- actions ----
  p.actions.forEach((a, i) => {
    const path = `/actions/${i}`;
    if (a.kind === 'navigate' && !screenIds.has(a.params?.screen ?? '')) {
      err(path, `Action "${a.label}" opens a screen, but params.screen ("${a.params?.screen ?? ''}") isn't a screen.`, a.id);
    }
    if (a.kind === 'state-set' && !stateByKey.has(a.params?.key ?? '')) {
      err(path, `Action "${a.label}" sets a data field, but params.key ("${a.params?.key ?? ''}") isn't a data field.`, a.id);
    }
  });

  // ---- entry ----
  if (!screenIds.has(p.entry.openScreen)) err('/entry', `The plugin's launch button opens "${p.entry.openScreen}", which isn't a screen.`);
  // base64 is 4/3 of the bytes; a launch icon over ~100 KB bloats every project file and the APK
  if (p.entry.iconImage && p.entry.iconImage.length > 140_000) warn('/entry/iconImage', 'The launch icon image is large (over 100 KB). A simpler picture with fewer colors keeps the plugin small.');

  // ---- theme: a highlight color that disappears into the dark panel helps nobody ----
  if (p.theme?.accent) {
    const accent = p.theme.accent;
    const faint = p.meta.targets.filter((t) => contrast(accent, PLATFORM_BG[t]) < UI_CONTRAST);
    if (faint.length) warn('/theme/accent', `The highlight color ${accent} is hard to see on the dark background of ${faint.map((t) => TARGET_NAMES[t]).join(', ')}. Try a lighter or brighter color.`);
  }

  // ---- node tree ----
  const nodeIds = new Set<string>();
  const usedActions = new Set<string>();

  const resolveBind = (bind: string, listItem: StateField | undefined): StateField | undefined => {
    if (bind.startsWith(ITEM_PREFIX)) return listItem?.itemFields?.find((f) => f.key === bind.slice(ITEM_PREFIX.length));
    return stateByKey.get(bind);
  };

  const walk = (n: Node, path: string, listItem: StateField | undefined) => {
    if (nodeIds.has(n.id)) err(path, `Two components share the id "${n.id}".`, n.id);
    nodeIds.add(n.id);

    const spec = componentSpec(n.kind, n.type);
    const kindWord = n.kind === 'container' ? 'layout' : 'component';
    if (!spec) {
      err(path, `Unknown ${kindWord} type "${n.type}".`, n.id);
    } else {
      // props
      for (const [name, ps] of Object.entries(spec.props)) {
        if ('required' in ps && ps.required && (n.props[name] === undefined || n.props[name] === '')) {
          err(path, `${spec.label} "${n.id}" needs a ${ps.label.toLowerCase()}.`, n.id);
        }
      }
      for (const [name, v] of Object.entries(n.props)) {
        const ps = spec.props[name];
        if (!ps) warn(path, `${spec.label} "${n.id}" has an unknown setting "${name}" — it'll be passed to the agent as-is.`, n.id);
        else if (!propMatches(ps, v)) err(path, `${spec.label} "${n.id}": "${ps.label}" should be ${describeProp(ps)}.`, n.id);
      }
      for (const [t, o] of Object.entries(n.targetOverrides ?? {})) {
        for (const [name, v] of Object.entries(o?.props ?? {})) {
          const ps = spec.props[name];
          if (ps && !propMatches(ps, v)) err(path, `${spec.label} "${n.id}" (${t} override): "${ps.label}" should be ${describeProp(ps)}.`, n.id);
        }
      }

      // binding
      if (n.bind !== undefined) {
        if (!spec.bindTypes) err(path, `${spec.label} "${n.id}" can't be connected to data.`, n.id);
        else {
          if (n.bind.startsWith(ITEM_PREFIX) && !listItem) err(path, `"${n.id}" uses ${n.bind}, but it isn't inside a repeating list.`, n.id);
          const field = resolveBind(n.bind, listItem);
          if (!field) {
            if (!(n.bind.startsWith(ITEM_PREFIX) && !listItem)) err(path, `"${n.id}" is connected to "${n.bind}", which isn't a data field.`, n.id);
          } else if (!spec.bindTypes.includes(field.type)) {
            err(path, `${spec.label} "${n.id}" can't show "${n.bind}" (type: ${field.type}). It takes: ${spec.bindTypes.join(', ')}.`, n.id);
          }
        }
      }

      // events
      for (const [ev, actionId] of Object.entries(n.on ?? {})) {
        if (!spec.events?.includes(ev)) err(path, `${spec.label} "${n.id}" doesn't have a "${ev}" event${spec.events ? ` (it has: ${spec.events.join(', ')})` : ''}.`, n.id);
        if (!actionIds.has(actionId)) err(path, `"${n.id}" runs action "${actionId}", which doesn't exist.`, n.id);
        usedActions.add(actionId);
      }

      // target support
      for (const t of p.meta.targets) {
        const hidden = n.targetOverrides?.[t]?.hidden;
        if (spec.support[t] === 'none' && !hidden) warn(path, `${TARGET_NAMES[t]} has no good way to show a ${spec.label}. Hide it there or pick another component.`, n.id);
      }
    }

    // visibility
    if (n.visibleWhen) {
      const f = resolveBind(n.visibleWhen.key, listItem);
      if (!f) err(path, `"${n.id}" shows/hides based on "${n.visibleWhen.key}", which isn't a data field.`, n.id);
      if ((n.visibleWhen.op === 'eq' || n.visibleWhen.op === 'neq') && n.visibleWhen.value === undefined) {
        err(path, `"${n.id}" visibility compares "${n.visibleWhen.key}" but gives no value to compare against.`, n.id);
      }
    }

    if (n.kind === 'container') {
      let childItem = listItem;
      if (n.type === 'list') {
        if (!n.bind) err(path, `Repeating list "${n.id}" isn't connected to a list field.`, n.id);
        else {
          const f = resolveBind(n.bind, listItem);
          if (f?.type === 'list') childItem = f;
        }
        if (n.children.length === 0) err(path, `Repeating list "${n.id}" has no row design — add components inside it.`, n.id);
      }
      if (n.type === 'tabs') {
        n.children.forEach((c, i) => {
          if (c.kind !== 'container' || !c.props.title) err(`${path}/children/${i}`, `Each tab in "${n.id}" must be a Section (or other layout) with a title — that's the tab name.`, c.id);
        });
      }
      n.children.forEach((c, i) => walk(c, `${path}/children/${i}`, childItem));
    }
  };

  p.screens.forEach((s, i) => walk(s.root, `/screens/${i}/root`, undefined));

  for (const a of p.actions) {
    if (!usedActions.has(a.id)) {
      warn('/actions', `Action "${a.label}" isn't triggered by anything yet.`, a.id);
    }
  }

  return issues;
}

export const TARGET_NAMES: Record<Target, string> = {
  atak: 'ATAK', wintak: 'WinTAK', webtak: 'WebTAK', cloudtak: 'CloudTAK', takx: 'TAKX',
};

function propMatches(ps: PropSpec, v: unknown): boolean {
  switch (ps.kind) {
    case 'string': return typeof v === 'string';
    case 'number': return typeof v === 'number' && (ps.min === undefined || v >= ps.min) && (ps.max === undefined || v <= ps.max);
    case 'boolean': return typeof v === 'boolean';
    case 'enum': return typeof v === 'string' && ps.options.includes(v);
    case 'stringList': return Array.isArray(v) && v.every((x) => typeof x === 'string');
  }
}

function describeProp(ps: PropSpec): string {
  switch (ps.kind) {
    case 'string': return 'text';
    case 'number': return `a number${ps.min !== undefined ? ` ≥ ${ps.min}` : ''}${ps.max !== undefined ? ` ≤ ${ps.max}` : ''}`;
    case 'boolean': return 'on/off';
    case 'enum': return `one of: ${ps.options.join(', ')}`;
    case 'stringList': return 'a list of text values';
  }
}
