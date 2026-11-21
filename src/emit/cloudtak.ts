// CloudTAK emitter: Project → Vue 3 SFC panels (Tabler classes) + typed reactive state +
// actions, under scaffold/cloudtak/plugin/. Verified in tests with vue-tsc --strict, the same
// gate CloudTAK's build enforces (export/platforms.ts rule). Registration (install(), routes,
// markRaw, home-menu entry) is left to the agent: it depends on the CloudTAK version.

import { componentSpec } from '../spec/catalog';
import { hiddenOn, withOverrides } from '../spec/overrides';
import { walk } from '../spec/tree';
import type { ContainerNode, ElementNode, Node, Project, Screen, StateField } from '../spec/types';
import { commentSafe, HEADER_NOTE, jsIdent, pascal, shortName, strLit, upperSnake, xmlEsc, type FileMap } from './common';

interface Scope {
  /** item variable name at this depth ("item", "item2") */
  v: string;
  field: StateField;
  /** TS prefix for this list's option constants, e.g. TEAM_ */
  prefix: string;
}

interface Ctx {
  p: Project;
  imports: Set<string>;
  scopes: Scope[];
  tabs: string[];
}

const T = '  ';
const optName = (prefix: string, key: string) => `${prefix}${upperSnake(key)}_OPTIONS`;
const itemType = (key: string) => `${pascal(key)}Item`;

// ------------------------------------------------------------------ state.ts / actions.ts

function tsType(f: StateField): string {
  switch (f.type) {
    case 'number': return 'number';
    case 'boolean': return 'boolean';
    case 'point': return '{ lat: number; lon: number } | null';
    case 'list': return `${itemType(f.key)}[]`;
    case 'datetime': return 'string';
    default: return 'string';
  }
}
function tsDefault(f: StateField): string {
  const d = f.default;
  switch (f.type) {
    case 'number': return typeof d === 'number' ? String(d) : '0';
    case 'boolean': return d === true ? 'true' : 'false';
    case 'point': return 'null';
    case 'list': return '[]';
    case 'enum': return strLit(typeof d === 'string' && d ? d : f.options?.[0]?.value ?? '');
    default: return strLit(typeof d === 'string' ? d : '');
  }
}

function stateTs(p: Project): string {
  const out: string[] = [
    `// ${HEADER_NOTE}`,
    '// The plugin\'s data fields (ui-spec "state"). localStorage is the offline fallback only: if the plugin',
    '// gets a server side, make the server the source of truth and keep this as a cache.',
    "import { reactive } from 'vue';", '',
    'export interface Option { value: string; label: string; color?: string }', '',
    `export const STORAGE_KEY = ${strLit(`plugin-${shortName(p)}:v1`)};`, '',
  ];
  const options = (fields: StateField[], prefix: string) => {
    for (const f of fields) {
      if (f.type === 'enum' && f.options?.length) {
        out.push(`export const ${optName(prefix, f.key)}: Option[] = [`, ...f.options.map((o) => `${T}{ value: ${strLit(o.value)}, label: ${strLit(o.label)}${o.color ? `, color: ${strLit(o.color)}` : ''} },`), '];');
      }
      if (f.type === 'list') options(f.itemFields ?? [], `${prefix}${upperSnake(f.key)}_`);
    }
  };
  options(p.state, '');
  out.push('');
  const iface = (name: string, fields: StateField[]) => {
    for (const f of fields) if (f.type === 'list') iface(itemType(f.key), f.itemFields ?? []);
    out.push(`export interface ${name} {`);
    for (const f of fields) {
      const doc = [f.label, f.description, f.type === 'contact' ? 'TAK contact UID.' : '', f.type === 'datetime' ? 'ISO date-time; "" = not set.' : '', f.persisted ? 'Remembered.' : ''].filter(Boolean).join(' ');
      if (doc) out.push(`${T}/** ${commentSafe(doc)} */`);
      out.push(`${T}${f.key}: ${tsType(f)};`);
    }
    out.push('}', '');
  };
  iface('PluginState', p.state);
  out.push('function defaults(): PluginState {', `${T}return {`, ...p.state.map((f) => `${T}${T}${f.key}: ${tsDefault(f)},`), `${T}};`, '}', '');
  const persisted = p.state.filter((f) => f.persisted && f.type !== 'list');
  out.push(`const PERSISTED = [${persisted.map((f) => strLit(f.key)).join(', ')}] as const;`, '',
    '/** Defaults first, then remembered values on top, so older snapshots gain new fields */',
    'function load(): PluginState {',
    `${T}const base = defaults();`,
    `${T}try {`,
    `${T}${T}const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Partial<PluginState>;`,
    `${T}${T}for (const k of PERSISTED) if (k in saved) Object.assign(base, { [k]: saved[k] });`,
    `${T}} catch { /* corrupt or blocked storage: start from defaults */ }`,
    `${T}return base;`, '}', '',
    'export const state = reactive<PluginState>(load());', '',
    '/** Write remembered fields. Call after changing one (or watch them). */',
    'export function save(): void {',
    `${T}const out: Partial<PluginState> = {};`,
    `${T}for (const k of PERSISTED) Object.assign(out, { [k]: state[k] });`,
    `${T}try { localStorage.setItem(STORAGE_KEY, JSON.stringify(out)); } catch (e) { console.warn('[plugin-${shortName(p)}] could not save state', e); }`,
    '}', '',
    'export function labelOf(options: Option[], value: string): string {',
    `${T}return options.find((o) => o.value === value)?.label ?? value;`, '}', '',
    'export function colorOf(options: Option[], value: string): string {',
    `${T}return options.find((o) => o.value === value)?.color ?? '#6B7280';`, '}', '',
    'export function fmtPoint(p: { lat: number; lon: number } | null): string {',
    `${T}return p ? \`\${p.lat.toFixed(5)}, \${p.lon.toFixed(5)}\` : 'Not set';`, '}', '');
  return out.join('\n');
}

/** Item type an action receives when a top-level list triggers it */
function actionItemTypes(p: Project): Map<string, string> {
  const m = new Map<string, string>();
  for (const s of p.screens) for (const n of walk(s.root)) {
    const a = n.on?.itemClick ?? n.on?.rowClick;
    if (a && n.bind && !n.bind.startsWith('$')) m.set(a, itemType(n.bind));
  }
  return m;
}

function actionsTs(p: Project): string {
  const items = actionItemTypes(p);
  const types = [...new Set(items.values())];
  const out = [
    `// ${HEADER_NOTE}`,
    '// One function per action. Each doc comment is the designer\'s description: implement exactly that.',
    ...(types.length ? [`import type { ${types.join(', ')} } from './state';`] : []), '',
    'export const actions = {',
  ];
  for (const a of p.actions) {
    const t = items.get(a.id);
    out.push(`${T}/**`, `${T} * ${commentSafe(a.label)} [${a.kind}${a.params && Object.keys(a.params).length ? `: ${Object.entries(a.params).map(([k, v]) => `${k}=${v}`).join(', ')}` : ''}]`,
      `${T} * ${commentSafe(a.intent || 'TODO: no description; ask the designer.')}`, `${T} */`,
      `${T}${jsIdent(camelId(a.id))}(${t ? `item: ${t} | null = null` : ''}): void {`,
      `${T}${T}console.warn('[plugin-${shortName(p)}] TODO ${a.id}'${t ? ', item' : ''});`, `${T}},`);
  }
  out.push('};', '');
  return out.join('\n');
}

const camelId = (id: string) => id.replace(/[-_]+([a-zA-Z0-9])/g, (_, c: string) => c.toUpperCase());

// ------------------------------------------------------------------ panels

function resolve(ctx: Ctx, bind: string | undefined): { expr: string; field: StateField; opts?: string } | undefined {
  if (!bind) return undefined;
  if (bind.startsWith('$item.')) {
    const sc = ctx.scopes[ctx.scopes.length - 1];
    const f = sc?.field.itemFields?.find((x) => x.key === bind.slice(6));
    if (!sc || !f) return undefined;
    return { expr: `${sc.v}.${f.key}`, field: f, opts: f.type === 'enum' && f.options?.length ? use(ctx, optName(sc.prefix, f.key)) : undefined };
  }
  const f = ctx.p.state.find((x) => x.key === bind);
  if (!f) return undefined;
  use(ctx, 'state');
  return { expr: `state.${f.key}`, field: f, opts: f.type === 'enum' && f.options?.length ? use(ctx, optName('', f.key)) : undefined };
}
const use = (ctx: Ctx, name: string) => (ctx.imports.add(name), name);

function display(ctx: Ctx, r: { expr: string; field: StateField; opts?: string }): string {
  switch (r.field.type) {
    case 'enum': return r.opts ? `${use(ctx, 'labelOf')}(${r.opts}, ${r.expr})` : r.expr;
    case 'boolean': return `${r.expr} ? 'Yes' : 'No'`;
    case 'point': return `${use(ctx, 'fmtPoint')}(${r.expr})`;
    case 'list': return `${r.expr}.length + ' items'`;
    default: return r.expr;
  }
}

function cond(ctx: Ctx, n: Node): string | undefined {
  const v = n.visibleWhen;
  if (!v) return undefined;
  const r = resolve(ctx, v.key);
  if (!r) return undefined;
  const t = r.field.type;
  const truthy = t === 'list' ? `${r.expr}.length > 0` : `!!${r.expr}`;
  if (v.op === 'truthy') return truthy;
  if (v.op === 'falsy') return `!(${truthy})`;
  const lit = t === 'number' ? String(Number(v.value)) : t === 'boolean' ? String(v.value === true || v.value === 'true') : `'${String(v.value).replace(/'/g, "\\'")}'`;
  return `${r.expr} ${v.op === 'eq' ? '===' : '!=='} ${lit}`;
}

const on = (ctx: Ctx, actionId: string | undefined, arg = '') => (actionId ? `${use(ctx, 'actions')}.${jsIdent(camelId(actionId))}(${arg})` : undefined);
const esc = (s: unknown) => xmlEsc(String(s ?? ''));

function node(ctx: Ctx, raw: Node, ind: string): string[] {
  const n = withOverrides(raw, 'cloudtak');
  if (hiddenOn(n, 'cloudtak')) return [`${ind}<!-- #${n.id} is hidden on CloudTAK -->`];
  const vIf = cond(ctx, n);
  const attrs = (cls: string, extra = '') => `class="${cls}" data-id="${n.id}"${vIf ? ` v-if="${esc(vIf)}"` : ''}${extra}`;
  return n.kind === 'container' ? container(ctx, n, ind, attrs) : element(ctx, n, ind, attrs);
}

function kids(ctx: Ctx, c: ContainerNode, ind: string): string[] {
  return c.children.flatMap((ch) => node(ctx, ch, ind));
}

function container(ctx: Ctx, c: ContainerNode, ind: string, attrs: (cls: string, extra?: string) => string): string[] {
  const gap = typeof c.props.gap === 'number' ? c.props.gap : 8;
  const i2 = ind + T;
  switch (c.type) {
    case 'stack':
      return [`${ind}<div ${attrs('d-flex flex-column', ` style="gap: ${gap}px"`)}>`, ...kids(ctx, c, i2), `${ind}</div>`];
    case 'row': {
      const align = ({ start: 'align-items-start', center: 'align-items-center', end: 'align-items-end', stretch: 'align-items-stretch' } as Record<string, string>)[String(c.props.align ?? 'center')];
      return [`${ind}<div ${attrs(`d-flex ${align}${c.props.wrap ? ' flex-wrap' : ''}`, ` style="gap: ${gap}px"`)}>`, ...kids(ctx, c, i2), `${ind}</div>`];
    }
    case 'section':
      return [`${ind}<div ${attrs('card')}>`,
        ...(c.props.title ? [`${i2}<div class="card-header"><h3 class="card-title">${esc(c.props.title)}</h3></div>`] : []),
        `${i2}<div class="card-body d-flex flex-column" style="gap: ${gap}px">`, ...kids(ctx, c, i2 + T), `${i2}</div>`, `${ind}</div>`];
    case 'collapsible':
      return [`${ind}<details ${attrs('card')}${c.props.startOpen === false ? '' : ' open'}>`,
        `${i2}<summary class="card-header fw-bold">${esc(c.props.title)}</summary>`,
        `${i2}<div class="card-body d-flex flex-column" style="gap: ${gap}px">`, ...kids(ctx, c, i2 + T), `${i2}</div>`, `${ind}</details>`];
    case 'scroll':
      return [`${ind}<div ${attrs('overflow-auto d-flex flex-column', ` style="max-height: 70vh; gap: ${gap}px"`)}>`, ...kids(ctx, c, i2), `${ind}</div>`];
    case 'tabs': {
      ctx.tabs.push(c.id);
      const key = `tabs['${c.id}']`;
      return [`${ind}<div ${attrs('')}>`,
        `${i2}<ul class="nav nav-tabs mb-2">`,
        ...c.children.map((t, i) => `${i2}${T}<li class="nav-item"><a href="#" class="nav-link" :class="{ active: ${key} === ${i} }" @click.prevent="${key} = ${i}">${esc(t.props.title ?? `Tab ${i + 1}`)}</a></li>`),
        `${i2}</ul>`,
        ...c.children.flatMap((t, i) => [`${i2}<template v-if="${key} === ${i}">`, ...node(ctx, t, i2 + T), `${i2}</template>`]),
        `${ind}</div>`];
    }
    case 'list':
      return list(ctx, c, ind, attrs);
  }
}

function list(ctx: Ctx, c: ContainerNode, ind: string, attrs: (cls: string, extra?: string) => string): string[] {
  const r = resolve(ctx, c.bind);
  if (!r || r.field.type !== 'list') return [`${ind}<!-- TODO #${c.id}: bound to "${c.bind ?? ''}", which isn't a list -->`];
  const depth = ctx.scopes.length + 1;
  const v = depth === 1 ? 'item' : `item${depth}`;
  const parentPrefix = ctx.scopes[ctx.scopes.length - 1]?.prefix ?? '';
  const scope: Scope = { v, field: r.field, prefix: `${parentPrefix}${upperSnake(r.field.key)}_` };
  const click = on(ctx, c.on?.itemClick, depth === 1 ? v : '');
  ctx.scopes.push(scope);
  const row = kids(ctx, c, ind + T + T);
  ctx.scopes.pop();
  return [
    `${ind}<div ${attrs('list-group')}>`,
    `${ind}${T}<div v-for="(${v}, i${depth}) in ${r.expr}" :key="i${depth}" class="list-group-item${click ? ' list-group-item-action' : ''}"${click ? ` role="button" @click="${click}"` : ''}>`,
    ...row,
    `${ind}${T}</div>`,
    `${ind}${T}<div v-if="${r.expr}.length === 0" class="list-group-item text-secondary fst-italic">${esc(c.props.emptyText ?? 'Nothing here yet')}</div>`,
    `${ind}</div>`,
  ];
}

function labelWrap(n: ElementNode, ind: string, attrs: (cls: string, extra?: string) => string, inner: (i: string) => string[]): string[] {
  const label = typeof n.props.label === 'string' && n.props.label ? n.props.label : undefined;
  if (!label) return inner(ind);
  return [`${ind}<div ${attrs('')}>`, `${ind}${T}<label class="form-label">${esc(label)}</label>`, ...inner(ind + T), `${ind}</div>`];
}

function element(ctx: Ctx, n: ElementNode, ind: string, attrs: (cls: string, extra?: string) => string): string[] {
  const p = n.props;
  const r = resolve(ctx, n.bind);
  const labelled = typeof p.label === 'string' && !!p.label && !['checkbox', 'toggle'].includes(n.type);
  // when labelled, the wrapper carries data-id / v-if; the control itself stays plain
  const self = (cls: string, extra = '') => (labelled ? `class="${cls}"${extra}` : attrs(cls, extra));
  const model = r && (r.field.type !== 'list') ? ` v-model${r.field.type === 'number' ? '.number' : ''}="${r.expr}"` : '';
  const change = on(ctx, n.on?.change);
  const changeAttr = change ? ` @change="${change}"` : '';
  const spec = componentSpec('element', n.type);
  const approx = spec?.support.cloudtak === 'approx' ? [`${ind}<!-- ${commentSafe(`${spec.label}: approximated with standard controls; refine to match the mockup.`)} -->`] : [];
  const btnClass = `btn ${({ primary: 'btn-primary', secondary: 'btn-outline-secondary', danger: 'btn-danger', subtle: 'btn-ghost-primary' } as Record<string, string>)[String(p.style ?? 'primary')]}${p.fullWidth ? ' w-100' : ''}`;
  const click = (id?: string) => (on(ctx, id) ? ` @click="${on(ctx, id)}"` : '');
  const L = (s: string) => [s];
  let out: string[];
  switch (n.type) {
    case 'heading': out = L(`${ind}<h${Number(p.level ?? 2) + 1} ${self('m-0')}>${esc(p.text)}</h${Number(p.level ?? 2) + 1}>`); break;
    case 'label': out = L(`${ind}<div ${self(p.muted ? 'text-secondary' : '')}>${r ? `{{ ${esc(display(ctx, r))} }}` : esc(p.text)}</div>`); break;
    case 'button': out = L(`${ind}<button type="button" ${self(btnClass)}${click(n.on?.click)}>${esc(p.text)}</button>`); break;
    case 'icon-button': out = L(`${ind}<button type="button" ${self('btn btn-icon', ` title="${esc(p.tooltip)}" aria-label="${esc(p.tooltip)}"`)}${click(n.on?.click)}><!-- TODO icon: ${commentSafe(String(p.icon))} -->◆</button>`); break;
    case 'text-input': case 'coordinate-field':
      out = labelWrap(n, ind, attrs, (i) => [`${i}<input type="text" ${self(`form-control${n.type === 'coordinate-field' ? ' font-monospace' : ''}`, `${p.placeholder ? ` placeholder="${esc(p.placeholder)}"` : ''}${p.readOnly ? ' readonly' : ''}`)}${r?.field.type === 'point' ? ` :value="${esc(display(ctx, r))}"` : model}${changeAttr}>`]);
      break;
    case 'number-input': out = labelWrap(n, ind, attrs, (i) => [`${i}<input type="number" ${self('form-control', `${p.min !== undefined ? ` min="${p.min}"` : ''}${p.max !== undefined ? ` max="${p.max}"` : ''}`)}${model}${changeAttr}>`]); break;
    case 'text-area': out = labelWrap(n, ind, attrs, (i) => [`${i}<textarea ${self('form-control', ` rows="${Number(p.rows ?? 3)}"${p.placeholder ? ` placeholder="${esc(p.placeholder)}"` : ''}`)}${model}${changeAttr}></textarea>`]); break;
    case 'dropdown': {
      const opts = r?.opts ? `<option v-for="o in ${r.opts}" :key="o.value" :value="o.value">{{ o.label }}</option>`
        : (Array.isArray(p.options) ? (p.options as string[]) : []).map((o) => `<option value="${esc(o)}">${esc(o)}</option>`).join('');
      out = labelWrap(n, ind, attrs, (i) => [`${i}<select ${self('form-select')}${model}${changeAttr}>${opts}</select>`]);
      break;
    }
    case 'checkbox': case 'toggle':
      out = L(`${ind}<label ${self(`form-check${n.type === 'toggle' ? ' form-switch' : ''}`)}><input class="form-check-input" type="checkbox"${r?.field.type === 'boolean' ? model : ''}${changeAttr}><span class="form-check-label">${esc(p.label)}</span></label>`);
      break;
    case 'radio-group': {
      const name = `radio-${n.id}`;
      const opts = r?.opts
        ? [`<label v-for="o in ${r.opts}" :key="o.value" class="form-check${p.horizontal ? ' form-check-inline' : ''}"><input class="form-check-input" type="radio" name="${name}" :value="o.value"${model}${changeAttr}><span class="form-check-label">{{ o.label }}</span></label>`]
        : (Array.isArray(p.options) ? (p.options as string[]) : []).map((o) => `<label class="form-check${p.horizontal ? ' form-check-inline' : ''}"><input class="form-check-input" type="radio" name="${name}" value="${esc(o)}"${model}${changeAttr}><span class="form-check-label">${esc(o)}</span></label>`);
      out = labelWrap(n, ind, attrs, (i) => [`${i}<div ${self('')}>`, ...opts.map((o) => `${i}${T}${o}`), `${i}</div>`]);
      break;
    }
    case 'slider': out = labelWrap(n, ind, attrs, (i) => [`${i}<input type="range" ${self('form-range', ` min="${Number(p.min ?? 0)}" max="${Number(p.max ?? 100)}" step="${Number(p.step ?? 1)}"`)}${model}${changeAttr}>`]); break;
    case 'datetime': {
      const type = ({ date: 'date', time: 'time' } as Record<string, string>)[String(p.mode)] ?? 'datetime-local';
      out = labelWrap(n, ind, attrs, (i) => [`${i}<input type="${type}" ${self('form-control')}${model}${changeAttr}>`]);
      break;
    }
    case 'color-picker': out = labelWrap(n, ind, attrs, (i) => [`${i}<input type="color" ${self('form-control form-control-color')}${model}${changeAttr}>`]); break;
    case 'image': out = L(`${ind}<div ${self('border rounded d-flex align-items-center justify-content-center text-secondary', ` style="height: ${Number(p.height ?? 96)}px" role="img" aria-label="${esc(p.alt)}"`)}><!-- TODO image: ${commentSafe(String(p.hint ?? p.alt))} -->${esc(p.alt)}</div>`); break;
    case 'divider': out = L(`${ind}<hr ${self('my-1')}>`); break;
    case 'progress': out = labelWrap(n, ind, attrs, (i) => [`${i}<div ${self('progress')}><div class="progress-bar${r ? '' : ' progress-bar-indeterminate'}"${r ? ` :style="{ width: (${r.expr} / ${Number(p.max ?? 100)}) * 100 + '%' }"` : ''}></div></div>`]); break;
    case 'status-badge':
      out = L(r?.opts ? `${ind}<span ${self(`badge text-white${p.size === 'large' ? ' fs-4' : ''}`)} :style="{ background: ${use(ctx, 'colorOf')}(${r.opts}, ${r.expr}) }">{{ ${esc(display(ctx, r))} }}</span>` : `${ind}<span ${self('badge')}>Status</span>`);
      break;
    case 'empty-state': out = L(`${ind}<div ${self('empty py-3')}><p class="empty-title">${esc(p.text)}</p></div>`); break;
    case 'table': {
      const cols = Array.isArray(p.columns) ? (p.columns as string[]) : [];
      const lr = r?.field.type === 'list' ? r : undefined;
      const row = on(ctx, n.on?.rowClick, 'row');
      const itemOpt = (col: string) => {
        const f = lr?.field.itemFields?.find((x) => x.key === col);
        return f?.type === 'enum' && f.options?.length ? `${use(ctx, 'labelOf')}(${use(ctx, optName(`${upperSnake(lr!.field.key)}_`, col))}, row.${col})` : `row.${col}`;
      };
      out = !lr ? L(`${ind}<!-- TODO #${n.id}: table isn't bound to a list -->`) : [
        `${ind}<table ${self('table table-sm table-hover')}>`,
        `${ind}${T}<thead><tr>${cols.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead>`,
        `${ind}${T}<tbody>`,
        `${ind}${T}${T}<tr v-for="(row, ri) in ${lr.expr}" :key="ri"${row ? ` role="button" @click="${row}"` : ''}>${cols.map((c) => `<td>{{ ${esc(itemOpt(c))} }}</td>`).join('')}</tr>`,
        `${ind}${T}${T}<tr v-if="${lr.expr}.length === 0"><td colspan="${Math.max(1, cols.length)}" class="text-secondary fst-italic">${esc(p.emptyText ?? 'No rows')}</td></tr>`,
        `${ind}${T}</tbody>`, `${ind}</table>`];
      break;
    }
    case 'map-point-picker':
      out = labelWrap(n, ind, attrs, (i) => [`${i}<div ${self('input-group')}>`, `${i}${T}<input type="text" class="form-control" readonly${r ? ` :value="${esc(display(ctx, r))}"` : ' value="Not set"'}>`,
        `${i}${T}<button type="button" class="btn btn-outline-primary"${click(n.on?.change)}>${esc(p.buttonText ?? 'Pick on map')}</button>`, `${i}</div>`]);
      break;
    case 'contact-picker': case 'cot-type-picker':
      out = labelWrap(n, ind, attrs, (i) => [`${i}<!-- TODO #${n.id}: populate from CloudTAK's ${n.type === 'contact-picker' ? 'contacts' : 'CoT type list'} -->`, `${i}<select ${self('form-select')}${r && r.field.type !== 'list' && r.field.type !== 'point' ? model : ''}${changeAttr}><option value="">Choose…</option></select>`]);
      break;
    case 'callsign': out = L(`${ind}<span ${self('fw-bold')}>${r ? `{{ ${esc(display(ctx, r))} }}` : '<!-- TODO: this user\'s callsign -->Callsign'}</span>`); break;
    case 'map-item-ref': out = L(`${ind}<button type="button" ${self('btn btn-outline-secondary')}${click(n.on?.click)}>${esc(p.label || 'Map item')}${r ? ` {{ ${esc(display(ctx, r))} }}` : ''}</button>`); break;
    case 'open-on-map': out = L(`${ind}<button type="button" ${self('btn btn-outline-secondary')}><!-- TODO: fly the map to ${r ? esc(r.expr) : 'the location'} -->${esc(p.text ?? 'Show on map')}</button>`); break;
    case 'data-package-attach': out = labelWrap(n, ind, attrs, (i) => [`${i}<input type="file" ${self('form-control')}${changeAttr}>`]); break;
    case 'chat-send':
      out = L(`${ind}<div ${self('input-group')}><input type="text" class="form-control" placeholder="${esc(p.placeholder ?? 'Message')}"><button type="button" class="btn btn-primary"${click(n.on?.send)}>Send</button></div>`);
      break;
    default: out = L(`${ind}<!-- TODO unknown component ${esc(n.type)} (#${n.id}) -->`);
  }
  return [...approx, ...out];
}

function panelVue(p: Project, s: Screen): string {
  const ctx: Ctx = { p, imports: new Set(), scopes: [], tabs: [] };
  const body = node(ctx, s.root, T + T);
  const stateImports = [...ctx.imports].filter((x) => x !== 'actions').sort();
  const script = ["<script setup lang=\"ts\">", `// Screen "${commentSafe(s.title)}" (#${s.id}). ${HEADER_NOTE}`];
  if (ctx.tabs.length) script.push("import { reactive } from 'vue';");
  if (stateImports.length) script.push(`import { ${stateImports.join(', ')} } from '../state';`);
  if (ctx.imports.has('actions')) script.push("import { actions } from '../actions';");
  if (ctx.tabs.length) script.push('', '/** active tab index per tabs block */', `const tabs = reactive<Record<string, number>>({ ${ctx.tabs.map((t) => `'${t}': 0`).join(', ')} });`);
  script.push('</script>');
  return [
    '<template>',
    `${T}<div class="takui-panel p-2">`,
    `${T}${T}<!-- ${commentSafe(s.title)} -->`,
    ...body,
    `${T}</div>`,
    '</template>', '',
    ...script, '',
  ].join('\n');
}

export function emitCloudtak(p: Project): FileMap {
  const files: FileMap = {
    'plugin/state.ts': stateTs(p),
    'plugin/actions.ts': actionsTs(p),
  };
  const lines: string[] = [];
  for (const s of p.screens) {
    const name = `${pascal(s.id)}Panel.vue`;
    files[`plugin/components/${name}`] = panelVue(p, s);
    lines.push(`- **${s.title}** (${s.surface}) → \`components/${name}\`${p.entry.openScreen === s.id ? ' (opened from the home-menu entry)' : ''}`);
  }
  files['SCAFFOLD.md'] = [
    `# CloudTAK scaffold: ${p.meta.name}`, '', HEADER_NOTE, '',
    'Copy `plugin/` into the CloudTAK plugin template (see CloudTAK-Plugin_Development). Then:', '',
    '1. Register a route per panel in the plugin class\'s `install()` (never in enable/disable), wrap components in `markRaw()`,',
    `   and namespace keys and routes (\`plugin-${shortName(p)}\`).`,
    '2. Add the home-menu entry for the launch button "' + p.entry.label + '".',
    '3. Implement `actions.ts`: each doc comment is the designer\'s description. Call `save()` after changing a remembered field.',
    '4. Must pass `vue-tsc --noEmit` and `eslint`, or CloudTAK\'s build fails. The builder\'s tests run vue-tsc --strict on this output.', '',
    '## Screens', '', ...lines, '',
  ].join('\n');
  return files;
}
