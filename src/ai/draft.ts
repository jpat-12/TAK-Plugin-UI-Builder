// Phase 4: "describe a screen → Claude drafts it". This file is the PURE half: the output
// schema Claude must follow, the prompts, and the conversion from Claude's flat draft into
// spec nodes. No network here (see client.ts), so all of it is unit-tested with canned drafts.
//
// Why a FLAT draft: structured outputs reject recursive JSON schemas, and our node tree is
// recursive. Claude returns nodes with a `parent` id; draftToNodes() rebuilds the tree.
// Everything Claude returns is treated as untrusted input: ids are re-made unique, types and
// props are checked against the catalog, and the result is validated like any other project.

import { z } from 'zod';
import { CONTAINERS, ELEMENTS, componentSpec, type PropSpec } from '../spec/catalog';
import { uniqueId } from '../spec/factory';
import { allNodeIds } from '../spec/tree';
import { ACTION_KINDS, STATE_TYPES, type Action, type ContainerNode, type ContainerType, type Node, type Project, type PropValue, type StateField } from '../spec/types';
import { TARGET_NAMES } from '../spec/validate';

const COMPONENT_TYPES = [...Object.keys(CONTAINERS), ...Object.keys(ELEMENTS)];
const isContainer = (t: string) => t in CONTAINERS;

// ------------------------------------------------------------------ the draft (Claude's output)

const str = { type: 'string' } as const;
const obj = (properties: Record<string, unknown>) => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties });

/** JSON Schema for output_config.format. Flat, every key required ("" = none). */
export const DRAFT_JSON_SCHEMA = obj({
  title: str,
  nodes: {
    type: 'array',
    items: obj({
      id: str,
      parent: str,
      type: { type: 'string', enum: COMPONENT_TYPES },
      text: str,
      props: { type: 'array', items: obj({ name: str, value: str }) },
      bind: str,
      event: str,
      action: str,
    }),
  },
  newFields: {
    type: 'array',
    items: obj({
      key: str,
      label: str,
      type: { type: 'string', enum: [...STATE_TYPES] },
      persisted: { type: 'boolean' },
      options: { type: 'array', items: obj({ value: str, label: str, color: str }) },
      itemFields: { type: 'array', items: obj({ key: str, type: { type: 'string', enum: STATE_TYPES.filter((t) => t !== 'list') }, options: { type: 'array', items: obj({ value: str, label: str, color: str }) } }) },
    }),
  },
  newActions: {
    type: 'array',
    items: obj({ id: str, label: str, kind: { type: 'string', enum: [...ACTION_KINDS] }, intent: str, screen: str }),
  },
  notes: str,
});

/** Client-side mirror of the schema: structured outputs guarantee shape, but a refusal or a
 *  truncated reply can still arrive, so the parsed JSON is checked again before use. */
const opt = z.object({ value: z.string(), label: z.string(), color: z.string() });
export const draftSchema = z.object({
  title: z.string(),
  nodes: z.array(z.object({ id: z.string(), parent: z.string(), type: z.string(), text: z.string(), props: z.array(z.object({ name: z.string(), value: z.string() })), bind: z.string(), event: z.string(), action: z.string() })),
  newFields: z.array(z.object({ key: z.string(), label: z.string(), type: z.enum(STATE_TYPES), persisted: z.boolean(), options: z.array(opt), itemFields: z.array(z.object({ key: z.string(), type: z.enum(STATE_TYPES), options: z.array(opt) })) })),
  newActions: z.array(z.object({ id: z.string(), label: z.string(), kind: z.enum(ACTION_KINDS), intent: z.string(), screen: z.string() })),
  notes: z.string(),
});
export type Draft = z.infer<typeof draftSchema>;

// ------------------------------------------------------------------ prompts

function propDoc(name: string, ps: PropSpec): string {
  switch (ps.kind) {
    case 'enum': return `${name} (${ps.options.join('|')})`;
    case 'boolean': return `${name} (true|false)`;
    case 'number': return `${name} (number)`;
    case 'stringList': return `${name} (values separated by |)`;
    default: return name;
  }
}

/** The component catalog as compact reference text: generated, so it can never drift from the builder */
export function catalogDigest(): string {
  const line = (type: string, kind: 'container' | 'element') => {
    const s = componentSpec(kind, type)!;
    const props = Object.entries(s.props).filter(([n]) => n !== mainTextProp(type)).map(([n, ps]) => propDoc(n, ps));
    return `- ${type}: ${s.description}${props.length ? ` Props: ${props.join(', ')}.` : ''}${s.bindTypes ? ` Binds to: ${s.bindTypes.join('/')}.` : ''}${s.events ? ` Events: ${s.events.join('/')}.` : ''}`;
  };
  return ['Layout blocks (can contain children):', ...Object.keys(CONTAINERS).map((t) => line(t, 'container')),
    '', 'Components:', ...Object.keys(ELEMENTS).map((t) => line(t, 'element'))].join('\n');
}

export const SYSTEM_PROMPT = `You draft screens for TAK plugins (ATAK, WinTAK, WebTAK, CloudTAK: situational-awareness apps used by public-safety and field teams) inside a visual UI builder. The person describing the screen is often not a programmer. Your draft is inserted into their design, where they will adjust it, and later a coding agent builds it.

Return one screen as a flat list of nodes. Each node has an id (short, lowercase, words joined by dashes, e.g. "send-btn") and a parent: the id of the layout block containing it, or "" for the top level of the screen. List parents before their children. Order within a parent is the on-screen order.

Rules:
- Layout is structural, never pixel-based. Group with stack (vertical), row (side by side), section (titled card), tabs, list. Plugin panels are narrow side panes, so keep rows to about three small items.
- "text" is the component's visible words: a button's label, a heading, a section or tab title, an input's label. Use "" if it has none.
- tabs: every child must be a section whose text is the tab name.
- list: its children are the template for ONE row. Bind row components to "$item.<field>" using the list field's itemFields.
- bind connects an input or display to a data field (existing or new). Use only types the component can bind to. "" = not connected.
- event + action: what happens when the user interacts ("click" for buttons, "change" for inputs, "itemClick" for lists). The action must be an existing action id or one in newActions. "" = nothing.
- Every action needs an intent: one or two plain-English sentences saying exactly what should happen, written for the coding agent (who receives what, what the user sees afterwards).
- Prefer existing data fields and actions when they fit. Only add new ones the screen actually needs. Choice fields (enum) get options with clear labels and a #RRGGBB color when color carries meaning (status, priority).
- Use plain, field-ready words, US English spelling, sentence case. No placeholder text like "Lorem ipsum".
- Build only what the person described, plus obviously required pieces (e.g. a submit button for a form). Mention anything you left out or assumed in notes, in one or two sentences.

${catalogDigest()}`;

export function userMessage(description: string, p: Project): string {
  const fields = p.state.map((f) => `${f.key} (${f.type}${f.type === 'enum' ? `: ${(f.options ?? []).map((o) => o.value).join('|')}` : ''}${f.type === 'list' ? `: items have ${(f.itemFields ?? []).map((i) => `${i.key}:${i.type}`).join(', ')}` : ''})`);
  const actions = p.actions.map((a) => `${a.id} (${a.kind}): ${a.intent}`);
  return [
    `Plugin: "${p.meta.name}"${p.meta.description ? `: ${p.meta.description}` : ''}`,
    `Platforms: ${p.meta.targets.map((t) => TARGET_NAMES[t]).join(', ')}`,
    `Existing data fields: ${fields.length ? fields.join('; ') : 'none'}`,
    `Existing actions: ${actions.length ? actions.join('; ') : 'none'}`,
    `Existing screens: ${p.screens.map((s) => `${s.id} ("${s.title}")`).join(', ')}`,
    '',
    'Draft this screen:',
    description.trim(),
  ].join('\n');
}

// ------------------------------------------------------------------ draft → spec

export interface DraftResult {
  title: string;
  /** the drafted screen content: a vertical stack */
  root: ContainerNode;
  newFields: StateField[];
  newActions: Action[];
  /** Claude's notes + anything the conversion fixed or dropped, in plain words */
  notes: string[];
  /** element count, for the preview summary */
  count: number;
}

/** The prop that holds a component's visible words */
export function mainTextProp(type: string): string | undefined {
  const spec = componentSpec(isContainer(type) ? 'container' : 'element', type);
  return ['text', 'title', 'label', 'tooltip', 'alt'].find((k) => spec?.props[k]);
}

const IDENT = /^[a-zA-Z][a-zA-Z0-9_]*$/;
const toKey = (s: string) => {
  if (IDENT.test(s)) return s; // already a code-safe key (keeps camelCase like hazardType)
  const w = s.replace(/[^a-zA-Z0-9]+/g, ' ').trim().split(' ').filter(Boolean);
  const k = w.map((x, i) => (i ? x[0]!.toUpperCase() + x.slice(1) : x.toLowerCase())).join('');
  return IDENT.test(k) ? k : `field${k}`;
};
const toId = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').replace(/^(?![a-z])/, 'n-') || 'node';

function coerce(ps: PropSpec, raw: string): PropValue | undefined {
  switch (ps.kind) {
    case 'number': { const n = Number(raw); return raw.trim() !== '' && Number.isFinite(n) ? n : undefined; }
    case 'boolean': return raw.trim().toLowerCase() === 'true' ? true : raw.trim().toLowerCase() === 'false' ? false : undefined;
    case 'enum': return ps.options.includes(raw) ? raw : undefined;
    case 'stringList': { const l = raw.split('|').map((x) => x.trim()).filter(Boolean); return l.length ? l : undefined; }
    default: return raw;
  }
}

const COLOR = /^#[0-9a-fA-F]{6}$/;
function toOptions(opts: Draft['newFields'][number]['options']) {
  const seen = new Set<string>();
  return opts.flatMap((o) => {
    // stored option values are identifiers: lowercase-first, so "Fire" and "fire" are one option
    const raw = (o.value || o.label).trim();
    const value = toKey(raw.charAt(0).toLowerCase() + raw.slice(1));
    if (seen.has(value)) return [];
    seen.add(value);
    return [{ value, label: o.label || o.value, ...(COLOR.test(o.color) ? { color: o.color.toUpperCase() } : {}) }];
  });
}

export function draftToNodes(d: Draft, p: Project): DraftResult {
  const notes: string[] = d.notes.trim() ? [d.notes.trim()] : [];
  const fix = (s: string) => notes.push(s);

  // ---- data fields: reuse same-name same-type fields, rename clashes ----
  const keyMap = new Map<string, string>();
  const newFields: StateField[] = [];
  const takenKeys = new Set(p.state.map((f) => f.key));
  for (const nf of d.newFields) {
    const want = toKey(nf.key || nf.label);
    const existing = p.state.find((f) => f.key === want);
    if (existing && existing.type === nf.type) { keyMap.set(nf.key, want); continue; }
    let key = want;
    for (let i = 2; takenKeys.has(key); i++) key = `${want}${i}`;
    takenKeys.add(key);
    keyMap.set(nf.key, key);
    const f: StateField = { key, label: nf.label || undefined, type: nf.type };
    if (nf.persisted) f.persisted = true;
    if (nf.type === 'enum') f.options = toOptions(nf.options).length ? toOptions(nf.options) : [{ value: 'option1', label: 'Option 1' }, { value: 'option2', label: 'Option 2' }];
    if (nf.type === 'list') {
      const itemKeys = new Set<string>();
      f.itemFields = nf.itemFields.flatMap((i) => {
        const k = toKey(i.key);
        if (itemKeys.has(k) || i.type === 'list') return [];
        itemKeys.add(k);
        const item: StateField = { key: k, type: i.type };
        if (i.type === 'enum') item.options = toOptions(i.options).length ? toOptions(i.options) : [{ value: 'option1', label: 'Option 1' }];
        return [item];
      });
      if (!f.itemFields.length) f.itemFields = [{ key: 'name', type: 'string' }];
    }
    newFields.push(f);
  }
  const allFields = [...p.state, ...newFields];

  // ---- actions: rename clashes ----
  const actionMap = new Map<string, string>();
  const newActions: Action[] = [];
  const takenActions = new Set(p.actions.map((a) => a.id));
  for (const na of d.newActions) {
    const want = toId(na.id || na.label);
    let id = want;
    for (let i = 2; takenActions.has(id); i++) id = `${want}-${i}`;
    takenActions.add(id);
    actionMap.set(na.id, id);
    const a: Action = { id, label: na.label || id, intent: na.intent.trim(), kind: na.kind };
    if (na.kind === 'navigate') {
      if (p.screens.some((s) => s.id === na.screen)) a.params = { screen: na.screen };
      else { a.kind = 'custom'; fix(`Action "${a.label}" opened a screen that doesn't exist yet, so it became a custom action. Point it at a screen in the Actions tab.`); }
    }
    newActions.push(a);
  }
  const actionIds = new Set([...p.actions.map((a) => a.id), ...newActions.map((a) => a.id)]);

  // ---- nodes ----
  const taken = allNodeIds(p);
  const root: ContainerNode = { id: uniqueId(`${toId(d.title || 'drafted')}-root`, taken), kind: 'container', type: 'stack', props: { gap: 8 }, children: [] };
  taken.add(root.id);
  const byDraftId = new Map<string, Node>([['', root]]);
  let count = 0;

  for (const dn of d.nodes) {
    if (!(dn.type in CONTAINERS) && !(dn.type in ELEMENTS)) { fix(`Skipped an unknown component type "${dn.type}".`); continue; }
    const kind = isContainer(dn.type) ? 'container' : 'element';
    const spec = componentSpec(kind, dn.type)!;
    const id = uniqueId(toId(dn.id || dn.type), taken);
    taken.add(id);
    const props: Record<string, PropValue> = {};
    const main = mainTextProp(dn.type);
    if (main && dn.text.trim()) props[main] = dn.text.trim();
    for (const { name, value } of dn.props) {
      const ps = spec.props[name];
      if (!ps) continue; // unknown settings are dropped silently: the catalog is the contract
      const v = coerce(ps, value);
      if (v !== undefined) props[name] = v;
    }
    // required text the draft left out: fall back to the component's label so it validates
    for (const [name, ps] of Object.entries(spec.props)) {
      if (ps.kind === 'string' && 'required' in ps && ps.required && props[name] === undefined) props[name] = name === 'icon' ? 'star' : spec.label;
    }
    const node: Node = kind === 'container' ? { id, kind, type: dn.type as ContainerType, props, children: [] } : { id, kind, type: dn.type, props };
    if (kind === 'element') count++;

    // bind: map renamed fields; keep $item binds (checked by the validator against the list)
    if (dn.bind && spec.bindTypes) {
      if (dn.bind.startsWith('$item.')) node.bind = `$item.${toKey(dn.bind.slice(6))}`;
      else {
        const key = keyMap.get(dn.bind) ?? dn.bind;
        const f = allFields.find((x) => x.key === key);
        if (f && spec.bindTypes.includes(f.type)) node.bind = key;
        else fix(`"${dn.text || id}" couldn't connect to "${dn.bind}", so it was left unconnected.`);
      }
    }
    // event → action
    if (dn.event && dn.action) {
      const act = actionMap.get(dn.action) ?? dn.action;
      if (!spec.events?.includes(dn.event)) fix(`"${dn.text || id}" has no "${dn.event}" event, so its action wasn't wired.`);
      else if (!actionIds.has(act)) fix(`"${dn.text || id}" pointed at an action that doesn't exist ("${dn.action}").`);
      else node.on = { [dn.event]: act };
    }

    // attach to parent; a missing or non-container parent falls back to the top level
    let parent = byDraftId.get(dn.parent);
    if (!parent || parent.kind !== 'container') {
      if (dn.parent) fix(`"${dn.text || id}" was placed at the top level (its parent "${dn.parent}" wasn't a layout block).`);
      parent = root;
    }
    if (parent.type === 'tabs' && node.kind !== 'container') {
      // tabs need titled sections; wrap stray content instead of producing a red error
      const wrap: ContainerNode = { id: uniqueId(`${id}-tab`, taken), kind: 'container', type: 'section', props: { title: String(props[main ?? ''] ?? 'Tab') }, children: [node] };
      taken.add(wrap.id);
      parent.children.push(wrap);
    } else {
      if (parent.type === 'tabs' && node.kind === 'container' && !node.props.title) node.props.title = dn.text.trim() || `Tab ${parent.children.length + 1}`;
      parent.children.push(node);
    }
    byDraftId.set(dn.id, node);
  }
  if (!count) fix('The draft had no components. Try describing what should be on the screen.');
  return { title: d.title.trim() || 'Drafted screen', root, newFields, newActions, notes, count };
}

/** Parse Claude's JSON text into a checked Draft, or throw a plain-language error */
export function parseDraft(text: string): Draft {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { throw new Error("Claude's reply wasn't valid JSON. Try again."); }
  const r = draftSchema.safeParse(raw);
  if (!r.success) throw new Error(`Claude's reply didn't match the expected shape (${r.error.issues[0]?.path.join('.') ?? '?'}). Try again.`);
  return r.data;
}
