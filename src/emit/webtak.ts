// WebTAK emitter: Project → dependency-free ES modules under plugin/src/ (state, actions, a
// tiny DOM helper, namespaced styles, one mount function per screen). WebTAK loads plugins as
// ONE classic script, so these are bundled by the plugin's build step (see
// WebTAK-Plugin-Channels/build.js: dependency-ordered concat with import/export stripped).
//
// State is a plain object (no framework): inputs write into it, actions change it and then
// call panel.render(). Lists re-render their rows on every render().

import { componentSpec } from '../spec/catalog';
import { hiddenOn, withOverrides } from '../spec/overrides';
import type { ContainerNode, ElementNode, Node, Project, Screen, StateField } from '../spec/types';
import { camel, commentSafe, HEADER_NOTE, jsIdent, pascal, shortName, strLit, upperSnake, type FileMap } from './common';

const T = '  ';
const optName = (prefix: string, key: string) => `${prefix}${upperSnake(key)}_OPTIONS`;
const v = (id: string) => `e_${camel(id)}`;

// ------------------------------------------------------------------ state / actions / dom / styles

function jsDefault(f: StateField): string {
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

function stateJs(p: Project): string {
  const out = [
    `// ${HEADER_NOTE}`,
    '// The plugin\'s data fields (ui-spec "state") as a plain object. Choice fields hold the option VALUE.', '',
    `export const STORAGE_KEY = ${strLit(`webtak-${shortName(p)}:v1`)};`, '',
  ];
  const options = (fields: StateField[], prefix: string) => {
    for (const f of fields) {
      if (f.type === 'enum' && f.options?.length) out.push(`export const ${optName(prefix, f.key)} = [`, ...f.options.map((o) => `${T}{ value: ${strLit(o.value)}, label: ${strLit(o.label)}${o.color ? `, color: ${strLit(o.color)}` : ''} },`), '];');
      if (f.type === 'list') options(f.itemFields ?? [], `${prefix}${upperSnake(f.key)}_`);
    }
  };
  options(p.state, '');
  const persisted = p.state.filter((f) => f.persisted && f.type !== 'list').map((f) => strLit(f.key));
  out.push('', `const PERSISTED = [${persisted.join(', ')}];`, '',
    '/** Fresh state: defaults, then remembered values from localStorage on top */',
    'export function createState() {',
    `${T}const state = {`,
    ...p.state.map((f) => `${T}${T}${f.key}: ${jsDefault(f)},${f.label || f.description ? ` // ${commentSafe([f.label, f.description, f.type === 'point' ? '{lat, lon} or null' : ''].filter(Boolean).join('. '))}` : ''}`),
    `${T}};`,
    `${T}try {`,
    `${T}${T}const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');`,
    `${T}${T}for (const k of PERSISTED) if (k in saved) state[k] = saved[k];`,
    `${T}} catch (e) { /* corrupt or blocked storage: keep defaults */ }`,
    `${T}return state;`, '}', '',
    'export function saveState(state) {',
    `${T}const out = {};`,
    `${T}for (const k of PERSISTED) out[k] = state[k];`,
    `${T}try { localStorage.setItem(STORAGE_KEY, JSON.stringify(out)); } catch (e) { console.warn('[webtak-${shortName(p)}] could not save state', e); }`,
    '}', '',
    'export function labelOf(options, value) { const o = options.find((x) => x.value === value); return o ? o.label : (value == null ? \'\' : String(value)); }',
    'export function colorOf(options, value) { const o = options.find((x) => x.value === value); return (o && o.color) || \'#6B7280\'; }',
    'export function fmtPoint(p) { return p ? p.lat.toFixed(5) + \', \' + p.lon.toFixed(5) : \'Not set\'; }', '');
  return out.join('\n');
}

function actionsJs(p: Project): string {
  const out = [`// ${HEADER_NOTE}`, '// One function per action. Each JSDoc is the designer\'s description: implement exactly that.', '// After changing state, call the panel\'s render().', '',
    'export function createActions(state) {', `${T}return {`];
  for (const a of p.actions) {
    out.push(`${T}${T}/** ${commentSafe(`${a.label} [${a.kind}]. ${a.intent || 'TODO: no description; ask the designer.'}`)} */`,
      `${T}${T}${jsIdent(camel(a.id))}(item) {`, `${T}${T}${T}console.warn('[webtak-${shortName(p)}] TODO ${a.id}', item, state);`, `${T}${T}},`);
  }
  out.push(`${T}};`, '}', '');
  return out.join('\n');
}

const DOM_JS = [
  `// ${HEADER_NOTE}`,
  '/** h("div", { class: "x", onclick: fn }, child, "text", ...) → element */',
  'export function h(tag, attrs, ...children) {',
  `${T}const el = document.createElement(tag);`,
  `${T}for (const [k, val] of Object.entries(attrs || {})) {`,
  `${T}${T}if (val == null || val === false) continue;`,
  `${T}${T}if (k.startsWith('on')) el.addEventListener(k.slice(2), val);`,
  `${T}${T}else if (k === 'class') el.className = val;`,
  `${T}${T}else if (k === 'style') el.style.cssText = val;`,
  `${T}${T}else el.setAttribute(k, val === true ? '' : String(val));`,
  `${T}}`,
  `${T}for (const c of children) if (c != null) el.append(c);`,
  `${T}return el;`, '}', '',
  '/** Write a value into an input unless the user is typing in it */',
  'export function setValue(el, value) {',
  `${T}if (el.ownerDocument.activeElement !== el) el.value = value == null ? '' : String(value);`, '}', '',
].join('\n');

function stylesJs(prefix: string): string {
  const c = `.${prefix}`;
  return [`// ${HEADER_NOTE}`, '// Namespaced so nothing leaks into WebTAK. Call once at boot.', '',
    'export function injectStyles(doc) {', `${T}if (doc.getElementById(${strLit(`${prefix}-styles`)})) return;`,
    `${T}const s = doc.createElement('style');`, `${T}s.id = ${strLit(`${prefix}-styles`)};`, `${T}s.textContent = \``,
    `${c}-panel { font: 14px/1.45 system-ui, sans-serif; color: #f8f9fa; background: #212529; padding: 8px; display: flex; flex-direction: column; gap: 8px; }`,
    `${c}-stack { display: flex; flex-direction: column; } ${c}-row { display: flex; align-items: center; }`,
    `${c}-card { border: 1px solid #495057; border-radius: 6px; padding: 8px; display: flex; flex-direction: column; } ${c}-card > h4 { margin: 0 0 6px; font-size: 13px; }`,
    `${c}-btn { padding: 6px 12px; border-radius: 6px; border: 1px solid #495057; background: #343a40; color: inherit; cursor: pointer; }`,
    `${c}-btn.primary { background: #0d6efd; border-color: #0d6efd; } ${c}-btn.danger { background: #dc3545; border-color: #dc3545; } ${c}-btn.subtle { background: none; border-color: transparent; color: #3fb1e3; }`,
    `${c}-input { width: 100%; box-sizing: border-box; padding: 5px 8px; border-radius: 6px; border: 1px solid #495057; background: #1a1d20; color: inherit; }`,
    `${c}-label { font-size: 12px; color: #adb5bd; display: block; margin-bottom: 2px; }`,
    `${c}-muted { color: #adb5bd; } ${c}-badge { display: inline-block; padding: 2px 8px; border-radius: 10px; color: #fff; font-weight: 600; font-size: 12px; }`,
    `${c}-tabs { display: flex; gap: 4px; border-bottom: 1px solid #495057; margin-bottom: 6px; } ${c}-tabs button.on { border-bottom: 2px solid #3fb1e3; }`,
    `${c}-list-row { padding: 6px 0; border-bottom: 1px solid #495057; } ${c}-empty { font-style: italic; color: #adb5bd; padding: 8px 0; }`,
    `${c}-table { width: 100%; border-collapse: collapse; } ${c}-table th, ${c}-table td { text-align: left; padding: 4px; border-bottom: 1px solid #495057; }`,
    '`;', `${T}doc.head.appendChild(s);`, '}', ''].join('\n');
}

// ------------------------------------------------------------------ panels

interface Scope { v: string; field: StateField; prefix: string }
interface JCtx {
  p: Project;
  cls: string;
  imports: Set<string>;
  scopes: Scope[];
  /** statements run at mount (or row build) */
  body: string[];
  /** statements run on every render() (top level only; rows rebuild instead) */
  render: string[];
  /** row builder functions */
  fns: string[];
  tabs: string[];
}

const use = (ctx: JCtx, name: string) => (ctx.imports.add(name), name);

function resolve(ctx: JCtx, bind: string | undefined): { expr: string; field: StateField; opts?: string; key: string; owner: string } | undefined {
  if (!bind) return undefined;
  if (bind.startsWith('$item.')) {
    const sc = ctx.scopes[ctx.scopes.length - 1];
    const f = sc?.field.itemFields?.find((x) => x.key === bind.slice(6));
    if (!sc || !f) return undefined;
    return { expr: `${sc.v}.${f.key}`, field: f, key: f.key, owner: sc.v, opts: f.type === 'enum' && f.options?.length ? use(ctx, optName(sc.prefix, f.key)) : undefined };
  }
  const f = ctx.p.state.find((x) => x.key === bind);
  return f ? { expr: `state.${f.key}`, field: f, key: f.key, owner: 'state', opts: f.type === 'enum' && f.options?.length ? use(ctx, optName('', f.key)) : undefined } : undefined;
}

function display(ctx: JCtx, r: NonNullable<ReturnType<typeof resolve>>): string {
  switch (r.field.type) {
    case 'enum': return r.opts ? `${use(ctx, 'labelOf')}(${r.opts}, ${r.expr})` : `String(${r.expr} ?? '')`;
    case 'boolean': return `(${r.expr} ? 'Yes' : 'No')`;
    case 'point': return `${use(ctx, 'fmtPoint')}(${r.expr})`;
    case 'list': return `(${r.expr}.length + ' items')`;
    default: return `String(${r.expr} ?? '')`;
  }
}

function cond(ctx: JCtx, n: Node): string | undefined {
  const w = n.visibleWhen;
  if (!w) return undefined;
  const r = resolve(ctx, w.key);
  if (!r) return undefined;
  const truthy = r.field.type === 'list' ? `${r.expr}.length > 0` : `!!${r.expr}`;
  if (w.op === 'truthy') return truthy;
  if (w.op === 'falsy') return `!(${truthy})`;
  const lit = r.field.type === 'number' ? String(Number(w.value)) : r.field.type === 'boolean' ? String(w.value === true || w.value === 'true') : strLit(String(w.value));
  return `${r.expr} ${w.op === 'eq' ? '===' : '!=='} ${lit}`;
}

/** Live statements: at top level they go to render(); inside a row they run once per row build */
const live = (ctx: JCtx, stmt: string) => (ctx.scopes.length ? ctx.body.push(stmt) : ctx.render.push(stmt));
const call = (_ctx: JCtx, actionId: string | undefined, arg = '') => (actionId ? `actions.${jsIdent(camel(actionId))}(${arg})` : undefined);
const itemArg = (ctx: JCtx) => ctx.scopes[ctx.scopes.length - 1]?.v ?? '';

function gen(ctx: JCtx, raw: Node, parent: string, gap: number, first: boolean, dir: 'v' | 'h') {
  const n = withOverrides(raw, 'webtak');
  if (hiddenOn(n, 'webtak')) { ctx.body.push(`// #${n.id} is hidden on WebTAK`); return; }
  const el = n.kind === 'container' ? genContainer(ctx, n) : genElement(ctx, n);
  if (!el) return;
  if (!first && gap) ctx.body.push(`${el}.style.${dir === 'v' ? 'marginTop' : 'marginLeft'} = '${gap}px';`);
  ctx.body.push(`${parent}.append(${el});`);
  const c = cond(ctx, n);
  if (c) live(ctx, `${el}.hidden = !(${c});`);
}

function genKids(ctx: JCtx, c: ContainerNode, parent: string, dir: 'v' | 'h') {
  const gap = typeof c.props.gap === 'number' ? c.props.gap : 8;
  c.children.forEach((ch, i) => gen(ctx, ch, parent, gap, i === 0, dir));
}

function genContainer(ctx: JCtx, c: ContainerNode): string {
  const e = v(c.id);
  const k = ctx.cls;
  switch (c.type) {
    case 'stack': ctx.body.push(`const ${e} = h('div', { class: '${k}-stack', 'data-id': ${strLit(c.id)} });`); genKids(ctx, c, e, 'v'); break;
    case 'row': ctx.body.push(`const ${e} = h('div', { class: '${k}-row', 'data-id': ${strLit(c.id)}${c.props.wrap ? ", style: 'flex-wrap: wrap'" : ''} });`); genKids(ctx, c, e, 'h'); break;
    case 'section':
      ctx.body.push(`const ${e} = h('div', { class: '${k}-card', 'data-id': ${strLit(c.id)} }${c.props.title ? `, h('h4', null, ${strLit(String(c.props.title))})` : ''});`);
      genKids(ctx, c, e, 'v');
      break;
    case 'collapsible':
      ctx.body.push(`const ${e} = h('details', { class: '${k}-card', 'data-id': ${strLit(c.id)}, open: ${c.props.startOpen !== false} }, h('summary', null, ${strLit(String(c.props.title ?? ''))}));`);
      genKids(ctx, c, e, 'v');
      break;
    case 'scroll': ctx.body.push(`const ${e} = h('div', { class: '${k}-stack', 'data-id': ${strLit(c.id)}, style: 'max-height: 60vh; overflow: auto' });`); genKids(ctx, c, e, 'v'); break;
    case 'tabs': {
      ctx.tabs.push(c.id);
      ctx.body.push(`const ${e} = h('div', { 'data-id': ${strLit(c.id)} });`, `const ${e}_bar = h('div', { class: '${k}-tabs' });`, `${e}.append(${e}_bar);`);
      c.children.forEach((t, i) => {
        ctx.body.push(`${e}_bar.append(h('button', { type: 'button', class: '${k}-btn', onclick: () => { tabs[${strLit(c.id)}] = ${i}; render(); } }, ${strLit(String(t.props.title ?? `Tab ${i + 1}`))}));`);
        gen(ctx, t, e, 0, true, 'v');
        if (hiddenOn(withOverrides(t, 'webtak'), 'webtak')) return;
        const page = v(t.id);
        ctx.render.push(`${page}.hidden = tabs[${strLit(c.id)}] !== ${i};`, `${e}_bar.children[${i}].classList.toggle('on', tabs[${strLit(c.id)}] === ${i});`);
      });
      break;
    }
    case 'list': {
      const r = resolve(ctx, c.bind);
      if (!r || r.field.type !== 'list') { ctx.body.push(`// TODO #${c.id}: not bound to a list`); return ''; }
      const depth = ctx.scopes.length + 1;
      const iv = depth === 1 ? 'item' : `item${depth}`;
      const parentPrefix = ctx.scopes[ctx.scopes.length - 1]?.prefix ?? '';
      const fn = `row_${camel(c.id)}`;
      ctx.body.push(`const ${e} = h('div', { 'data-id': ${strLit(c.id)} });`);
      // build the row function with its own statement buffer
      const saved = ctx.body;
      ctx.body = [];
      ctx.scopes.push({ v: iv, field: r.field, prefix: `${parentPrefix}${upperSnake(r.field.key)}_` });
      const click = call(ctx, c.on?.itemClick, iv);
      ctx.body.push(`const row = h('div', { class: '${k}-list-row'${click ? `, style: 'cursor: pointer', onclick: () => ${click}` : ''} });`);
      genKids(ctx, c, 'row', 'v');
      ctx.scopes.pop();
      const rowBody = ctx.body;
      ctx.body = saved;
      ctx.fns.push(`${T}function ${fn}(${iv}) {`, ...rowBody.map((l) => `${T}${T}${l}`), `${T}${T}return row;`, `${T}}`);
      live(ctx, `${e}.replaceChildren(...${r.expr}.map(${fn}));`);
      live(ctx, `if (${r.expr}.length === 0) ${e}.append(h('div', { class: '${k}-empty' }, ${strLit(String(c.props.emptyText ?? 'Nothing here yet'))}));`);
      break;
    }
  }
  return e;
}

function genElement(ctx: JCtx, n: ElementNode): string {
  const k = ctx.cls;
  const p = n.props;
  const e = v(n.id);
  const r = resolve(ctx, n.bind);
  const B = (...lines: string[]) => ctx.body.push(...lines);
  const spec = componentSpec('element', n.type);
  if (spec?.support.webtak === 'approx') B(`// ${commentSafe(`${spec.label}: approximated with standard controls; refine to match the mockup.`)}`);
  const changeFire = call(ctx, n.on?.change, itemArg(ctx));
  const label = typeof p.label === 'string' && p.label && !['checkbox', 'toggle'].includes(n.type) ? p.label : undefined;
  /** wrap an input with its label; returns the outer element var */
  const wrap = (inner: string) => {
    if (!label) return inner;
    B(`const ${e}_wrap = h('label', { 'data-id': ${strLit(n.id)} }, h('span', { class: '${k}-label' }, ${strLit(label)}), ${inner});`);
    return `${e}_wrap`;
  };
  /** two-way binding for value inputs (top-level or item fields) */
  const bindValue = (parse: string) => {
    if (!r || r.field.type === 'list' || r.field.type === 'point') return;
    B(`${e}.addEventListener('${n.type === 'dropdown' || n.type === 'datetime' || n.type === 'color-picker' ? 'change' : 'input'}', () => { ${r.owner}.${r.key} = ${parse}; ${changeFire ? `${changeFire}; ` : ''}});`);
    live(ctx, `${use(ctx, 'setValue')}(${e}, ${r.expr});`);
  };
  const btn = (text: string, style: string, onclick?: string) => `h('button', { type: 'button', class: '${k}-btn ${style}'${onclick ? `, onclick: () => ${onclick}` : ''} }, ${strLit(text)})`;

  switch (n.type) {
    case 'heading': B(`const ${e} = h('h${Number(p.level ?? 2) + 1}', { 'data-id': ${strLit(n.id)}, style: 'margin: 0' }, ${strLit(String(p.text ?? ''))});`); return e;
    case 'label':
      B(`const ${e} = h('div', { 'data-id': ${strLit(n.id)}${p.muted ? `, class: '${k}-muted'` : ''} }${r ? '' : `, ${strLit(String(p.text ?? ''))}`});`);
      if (r) live(ctx, `${e}.textContent = ${display(ctx, r)};`);
      return e;
    case 'button': case 'icon-button': case 'map-item-ref': case 'open-on-map': {
      const text = n.type === 'button' ? String(p.text ?? '') : n.type === 'icon-button' ? '◆' : n.type === 'open-on-map' ? String(p.text ?? 'Show on map') : String(p.label || 'Map item');
      const style = n.type === 'button' ? String(p.style ?? 'primary') : '';
      const click = call(ctx, n.on?.click, itemArg(ctx));
      B(`const ${e} = ${btn(text, style, click)};`);
      B(`${e}.dataset.id = ${strLit(n.id)};`);
      if (n.type === 'icon-button') B(`${e}.title = ${strLit(String(p.tooltip ?? ''))}; // TODO icon: ${commentSafe(String(p.icon ?? ''))}`);
      if (p.fullWidth) B(`${e}.style.width = '100%';`);
      if (n.type === 'open-on-map') B(`// TODO #${n.id}: pan the WebTAK map to ${r ? r.expr : 'the location'}`);
      return e;
    }
    case 'text-input': case 'coordinate-field': case 'number-input': case 'datetime': case 'color-picker': {
      const type = n.type === 'number-input' ? 'number' : n.type === 'color-picker' ? 'color' : n.type === 'datetime' ? (({ date: 'date', time: 'time' } as Record<string, string>)[String(p.mode)] ?? 'datetime-local') : 'text';
      B(`const ${e} = h('input', { class: '${k}-input', type: '${type}'${p.placeholder ? `, placeholder: ${strLit(String(p.placeholder))}` : ''}${p.readOnly ? ', readonly: true' : ''}${label ? '' : `, 'data-id': ${strLit(n.id)}`} });`);
      if (r?.field.type === 'point') live(ctx, `${use(ctx, 'setValue')}(${e}, ${display(ctx, r)});`);
      else bindValue(n.type === 'number-input' ? `Number(${e}.value)` : `${e}.value`);
      return wrap(e);
    }
    case 'text-area':
      B(`const ${e} = h('textarea', { class: '${k}-input', rows: ${Number(p.rows ?? 3)}${p.placeholder ? `, placeholder: ${strLit(String(p.placeholder))}` : ''}${label ? '' : `, 'data-id': ${strLit(n.id)}`} });`);
      bindValue(`${e}.value`);
      return wrap(e);
    case 'dropdown': case 'contact-picker': case 'cot-type-picker': {
      B(`const ${e} = h('select', { class: '${k}-input'${label ? '' : `, 'data-id': ${strLit(n.id)}`} });`);
      if (n.type !== 'dropdown') B(`// TODO #${n.id}: fill from WebTAK ${n.type === 'contact-picker' ? 'contacts' : 'CoT types'}`, `${e}.append(h('option', { value: '' }, 'Choose…'));`);
      else if (r?.opts) B(`for (const o of ${r.opts}) ${e}.append(h('option', { value: o.value }, o.label));`);
      else for (const o of Array.isArray(p.options) ? (p.options as string[]) : []) B(`${e}.append(h('option', { value: ${strLit(o)} }, ${strLit(o)}));`);
      bindValue(`${e}.value`);
      return wrap(e);
    }
    case 'checkbox': case 'toggle':
      B(`const ${e} = h('input', { type: 'checkbox' });`);
      if (r?.field.type === 'boolean') {
        B(`${e}.addEventListener('change', () => { ${r.owner}.${r.key} = ${e}.checked; ${changeFire ? `${changeFire}; ` : ''}});`);
        live(ctx, `${e}.checked = !!${r.expr};`);
      }
      B(`const ${e}_wrap = h('label', { 'data-id': ${strLit(n.id)} }, ${e}, ' ', ${strLit(String(p.label ?? ''))});`);
      return `${e}_wrap`;
    case 'radio-group': {
      B(`const ${e} = h('div', { ${p.horizontal ? `class: '${k}-row', ` : ''}'data-id': ${strLit(n.id)} });`);
      const list = r?.opts ?? `[${(Array.isArray(p.options) ? (p.options as string[]) : []).map((o) => `{ value: ${strLit(o)}, label: ${strLit(o)} }`).join(', ')}]`;
      B(`for (const o of ${list}) {`,
        `${T}const radio = h('input', { type: 'radio', name: ${strLit(`${n.id}-${ctx.scopes.length ? 'row' : 'top'}`)}, value: o.value });`,
        ...(r && r.field.type !== 'list' ? [`${T}radio.addEventListener('change', () => { ${r.owner}.${r.key} = o.value; ${changeFire ? `${changeFire}; ` : ''}});`] : []),
        `${T}${e}.append(h('label', { style: 'margin-right: 12px' }, radio, ' ', o.label));`, '}');
      if (r && r.field.type !== 'list') live(ctx, `for (const radio of ${e}.querySelectorAll('input')) radio.checked = radio.value === ${r.expr};`);
      return wrap(e);
    }
    case 'slider':
      B(`const ${e} = h('input', { type: 'range', min: ${Number(p.min ?? 0)}, max: ${Number(p.max ?? 100)}, step: ${Number(p.step ?? 1)}${label ? '' : `, 'data-id': ${strLit(n.id)}`} });`);
      bindValue(`Number(${e}.value)`);
      return wrap(e);
    case 'image': B(`const ${e} = h('div', { 'data-id': ${strLit(n.id)}, role: 'img', 'aria-label': ${strLit(String(p.alt ?? ''))}, style: 'height: ${Number(p.height ?? 96)}px; border: 1px dashed #495057' }); // TODO image: ${commentSafe(String(p.hint ?? p.alt ?? ''))}`); return e;
    case 'divider': B(`const ${e} = h('hr', { 'data-id': ${strLit(n.id)} });`); return e;
    case 'progress':
      B(`const ${e} = h('progress', { max: ${Number(p.max ?? 100)}${label ? '' : `, 'data-id': ${strLit(n.id)}`}, style: 'width: 100%' });`);
      if (r?.field.type === 'number') live(ctx, `${e}.value = ${r.expr};`);
      return wrap(e);
    case 'status-badge':
      B(`const ${e} = h('span', { class: '${k}-badge', 'data-id': ${strLit(n.id)} });`);
      if (r?.opts) live(ctx, `${e}.textContent = ${display(ctx, r)};`), live(ctx, `${e}.style.background = ${use(ctx, 'colorOf')}(${r.opts}, ${r.expr});`);
      return e;
    case 'empty-state': B(`const ${e} = h('div', { class: '${k}-empty', 'data-id': ${strLit(n.id)} }, ${strLit(String(p.text ?? ''))});`); return e;
    case 'callsign':
      B(`const ${e} = h('strong', { 'data-id': ${strLit(n.id)} }${r ? '' : ", 'Callsign'"});${r ? '' : " // TODO: this user's callsign"}`);
      if (r) live(ctx, `${e}.textContent = ${display(ctx, r)};`);
      return e;
    case 'table': {
      const cols = Array.isArray(p.columns) ? (p.columns as string[]) : [];
      if (!r || r.field.type !== 'list') { B(`// TODO #${n.id}: table isn't bound to a list`); return ''; }
      const lf = r.field;
      const rowClick = call(ctx, n.on?.rowClick, 'row');
      B(`const ${e} = h('table', { class: '${k}-table', 'data-id': ${strLit(n.id)} }, h('thead', null, h('tr', null, ${cols.map((c) => `h('th', null, ${strLit(c)})`).join(', ')})));`,
        `const ${e}_body = h('tbody');`, `${e}.append(${e}_body);`);
      const cell = (c: string) => {
        const f = lf.itemFields?.find((x) => x.key === c);
        return f?.type === 'enum' && f.options?.length ? `${use(ctx, 'labelOf')}(${use(ctx, optName(`${upperSnake(lf.key)}_`, c))}, row.${c})` : `String(row.${c} ?? '')`;
      };
      live(ctx, `${e}_body.replaceChildren(...${r.expr}.map((row) => h('tr', ${rowClick ? `{ style: 'cursor: pointer', onclick: () => ${rowClick} }` : 'null'}, ${cols.map((c) => `h('td', null, ${cell(c)})`).join(', ')})));`);
      live(ctx, `if (${r.expr}.length === 0) ${e}_body.append(h('tr', null, h('td', { colspan: ${Math.max(1, cols.length)}, class: '${k}-empty' }, ${strLit(String(p.emptyText ?? 'No rows'))})));`);
      return e;
    }
    case 'map-point-picker': case 'data-package-attach': {
      const isMap = n.type === 'map-point-picker';
      B(`const ${e}_value = h('span', { style: 'flex: 1' }, ${strLit(isMap ? 'Not set' : 'No file')});`);
      if (r && isMap) live(ctx, `${e}_value.textContent = ${display(ctx, r)};`);
      B(`const ${e} = h('div', { class: '${k}-row', style: 'gap: 6px'${label ? '' : `, 'data-id': ${strLit(n.id)}`} }, ${e}_value, ${btn(isMap ? String(p.buttonText ?? 'Pick on map') : 'Attach…', '', call(ctx, n.on?.change, itemArg(ctx)))});`);
      return wrap(e);
    }
    case 'chat-send': {
      const send = call(ctx, n.on?.send, itemArg(ctx));
      B(`const ${e} = h('div', { class: '${k}-row', style: 'gap: 6px', 'data-id': ${strLit(n.id)} }, h('input', { class: '${k}-input', placeholder: ${strLit(String(p.placeholder ?? 'Message'))} }), ${btn('Send', 'primary', send)});`);
      return e;
    }
    default:
      B(`// TODO unknown component ${n.type} (#${n.id})`);
      return '';
  }
}

function panelJs(p: Project, s: Screen, cls: string): string {
  const ctx: JCtx = { p, cls, imports: new Set(), scopes: [], body: [], render: [], fns: [], tabs: [] };
  ctx.body.push(`const root = h('div', { class: '${cls}-panel', 'data-screen': ${strLit(s.id)} }, h('strong', null, ${strLit(s.title)}));`);
  gen(ctx, s.root, 'root', 0, true, 'v');
  const fnName = `mount${pascal(s.id)}`;
  const stateImports = [...ctx.imports].filter((x) => x !== 'setValue').sort();
  return [
    `// Screen "${commentSafe(s.title)}" (#${s.id}). ${HEADER_NOTE}`,
    `import { h${ctx.imports.has('setValue') ? ', setValue' : ''} } from './dom.js';`,
    ...(stateImports.length ? [`import { ${stateImports.join(', ')} } from './state.js';`] : []), '',
    '/**',
    ` * Build the "${commentSafe(s.title)}" panel into \`host\`. Returns { root, render }: call render() after changing state.`,
    ' * @param {HTMLElement} host  @param {object} state  createState()  @param {object} actions  createActions(state)',
    ' */',
    `export function ${fnName}(host, state, actions) {`,
    ...(ctx.tabs.length ? [`${T}const tabs = { ${ctx.tabs.map((t) => `${strLit(t)}: 0`).join(', ')} };`] : []),
    ...ctx.fns,
    ...ctx.body.map((l) => `${T}${l}`),
    `${T}host.append(root);`, '',
    `${T}function render() {`, ...ctx.render.map((l) => `${T}${T}${l}`), `${T}}`, '',
    `${T}render();`,
    `${T}return { root, render };`, '}', '',
  ].join('\n');
}

export function emitWebtak(p: Project): FileMap {
  const cls = `takui-${shortName(p)}`;
  const files: FileMap = {
    'plugin/src/state.js': stateJs(p),
    'plugin/src/actions.js': actionsJs(p),
    'plugin/src/dom.js': DOM_JS,
    'plugin/src/styles.js': stylesJs(cls),
  };
  const lines: string[] = [];
  for (const s of p.screens) {
    files[`plugin/src/panel-${s.id}.js`] = panelJs(p, s, cls);
    lines.push(`- **${s.title}** (${s.surface}) → \`panel-${s.id}.js\` → \`mount${pascal(s.id)}(host, state, actions)\`${p.entry.openScreen === s.id ? ' (opened from the menu entry)' : ''}`);
  }
  files['SCAFFOLD.md'] = [
    `# WebTAK scaffold: ${p.meta.name}`, '', HEADER_NOTE, '',
    'Copy `plugin/src/` into the WebTAK plugin (see WebTAK-Plugin-Channels). Then:', '',
    '1. Add these modules to the build\'s module order: `state.js`, `actions.js`, `dom.js`, `styles.js`, then the panels, then your boot code.',
    '   WebTAK loads ONE classic script, so the build strips import/export and concatenates.',
    '2. At boot: `injectStyles(document)`, `const state = createState()`, `const actions = createActions(state)`,',
    `   then mount the launch screen into a floating panel opened by the "${p.entry.label}" menu entry.`,
    '3. Implement `actions.js` (each JSDoc is the designer\'s description). After changing state, call the panel\'s `render()`;',
    '   call `saveState(state)` after changing a remembered field.', '',
    '## Screens', '', ...lines, '',
    '## Verified', '', 'The builder\'s tests run every panel in jsdom: mount, render, type into inputs, and check state updates.', '',
  ].join('\n');
  return files;
}

