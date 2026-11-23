// ATAK emitter, part 1: screen → Android layout XML, plus a record of every generated view
// so java.ts can build the matching view holder. Plain framework widgets only (no AndroidX):
// ATAK plugins load into ATAK's process, and extra libraries are a build/compat risk there.
//
// Mapping (also in export/platforms.ts for the agent):
//   stack/section/collapsible → vertical LinearLayout · row → horizontal LinearLayout
//   scroll → ScrollView › LinearLayout · tabs → button bar + FrameLayout pages (switched in Java)
//   list/table → ListView + a row layout per list, bound by a generated BaseAdapter

import { componentSpec } from '../../spec/catalog';
import { hiddenOn, withOverrides } from '../../spec/overrides';
import type { ContainerNode, ElementNode, Node, Project, Screen, StateField } from '../../spec/types';
import { androidStr, camel, commentSafe, snake, xmlEsc } from '../common';

/** wrap = the FrameLayout around anything with a show-when rule, so the whole thing (label included) hides */
export type Role = 'main' | 'value' | 'action' | 'input' | 'header' | 'body' | 'tab' | 'empty' | 'wrap';

export interface ViewRec {
  node: Node;
  /** Java field name in the holder (or local in the row binder) */
  field: string;
  resId: string;
  javaType: string;
  role: Role;
  tabIndex?: number;
  /** radio-group: [resId, value] per RadioButton */
  radios?: [string, string][];
}

export interface ListRec {
  node: Node;
  view: ViewRec;
  /** The list's field (top-level or an item field of an outer list) */
  field: StateField | undefined;
  rowLayout: string;
  rowViews: ViewRec[];
  isTable: boolean;
  columns: string[];
}

export interface ScreenPlan {
  screen: Screen;
  layout: string;
  xml: string;
  views: ViewRec[];
  lists: ListRec[];
  rows: { name: string; xml: string }[];
}

export interface ResSink {
  prefix: string;
  strings: Map<string, string>;
  arrays: Map<string, string[]>;
}

const NS = 'xmlns:android="http://schemas.android.com/apk/res/android"';
const DP = (n: number) => `${n}dp`;

interface Ctx {
  p: Project;
  res: ResSink;
  /** where views land: the screen holder, or a list row */
  views: ViewRec[];
  lists: ListRec[];
  rows: { name: string; xml: string }[];
  scope: StateField | undefined;
}

export function str(res: ResSink, id: string, prop: string, value: string): string {
  const name = `${res.prefix}_${snake(id)}_${snake(prop)}`;
  res.strings.set(name, value);
  return `@string/${name}`;
}

/** Resolve a bind key against the current list scope */
function fieldFor(ctx: Ctx, bind: string | undefined): StateField | undefined {
  if (!bind) return undefined;
  if (bind.startsWith('$item.')) return ctx.scope?.itemFields?.find((f) => f.key === bind.slice(6));
  return ctx.p.state.find((f) => f.key === bind);
}

/** Options shown by a dropdown / radio group: the bound enum's, else props.options */
export function optionsOf(node: Node, f: StateField | undefined): { value: string; label: string }[] {
  if (f?.type === 'enum' && f.options?.length) return f.options;
  const o = node.props.options;
  return Array.isArray(o) ? o.map((v) => ({ value: v, label: v })) : [];
}

type Attrs = [string, string | number | undefined][];

function open(tag: string, attrs: Attrs, indent: string, selfClose: boolean): string {
  // the namespace declaration travels as a bare key (value undefined); every other undefined is "omit"
  const a = attrs.filter(([k, v]) => v !== undefined || k.startsWith('xmlns')).map(([k, v]) => `${indent}    ${v === undefined ? k : `${k}="${v}"`}`);
  return `${indent}<${tag}\n${a.join('\n')}${selfClose ? ' />' : '>'}`;
}

export function planScreen(p: Project, screen: Screen, res: ResSink): ScreenPlan {
  const ctx: Ctx = { p, res, views: [], lists: [], rows: [], scope: undefined };
  const layout = `${res.prefix}_screen_${snake(screen.id)}`;
  const body = emit(ctx, withOverrides(screen.root, 'atak'), '', { dir: 'v', first: true, gap: 0, root: true });
  const xml = `<?xml version="1.0" encoding="utf-8"?>\n<!-- ${commentSafe(`Screen "${screen.title}" (#${screen.id}). Inflate with PluginLayoutInflater, then wrap in ${pascalScreen(screen)}Views.`)} -->\n${body.join('\n')}\n`;
  return { screen, layout, xml, views: ctx.views, lists: ctx.lists, rows: ctx.rows };
}

export const pascalScreen = (s: Screen) => camel(s.id).replace(/^./, (c) => c.toUpperCase());

interface Pos { dir: 'v' | 'h'; first: boolean; gap: number; root?: boolean; fill?: boolean }

/** Size + spacing attributes a child gets from its parent */
function place(pos: Pos, n: Node, defaultW: 'match' | 'wrap'): Attrs {
  const full = n.props.fullWidth === true;
  let w: string = defaultW === 'match' ? 'match_parent' : 'wrap_content';
  const extra: Attrs = [];
  if (pos.dir === 'h') {
    w = full || pos.fill ? '0dp' : 'wrap_content';
    if (full || pos.fill) extra.push(['android:layout_weight', '1']);
  } else if (full) w = 'match_parent';
  const attrs: Attrs = [
    ...(pos.root ? [[NS, undefined] as [string, undefined]] : []),
    ['android:layout_width', w],
    ['android:layout_height', 'wrap_content'],
    ...extra,
  ];
  if (!pos.first && pos.gap) attrs.push([pos.dir === 'v' ? 'android:layout_marginTop' : 'android:layout_marginStart', DP(pos.gap)]);
  return attrs;
}

function track(ctx: Ctx, node: Node, javaType: string, role: Role, suffix = '', extra: Partial<ViewRec> = {}): string {
  const resId = snake(node.id) + (suffix ? `_${suffix}` : '');
  ctx.views.push({ node, field: camel(node.id + (suffix ? `-${suffix}` : '')), resId, javaType, role, ...extra });
  return `@+id/${resId}`;
}

function emit(ctx: Ctx, n: Node, indent: string, pos: Pos): string[] {
  const node = withOverrides(n, 'atak');
  if (hiddenOn(node, 'atak')) return [`${indent}<!-- #${node.id} is hidden on ATAK -->`];
  const inner = (i: string, q: Pos) => (node.kind === 'container' ? container(ctx, node, i, q) : element(ctx, node, i, q));
  if (!node.visibleWhen || pos.root) return inner(indent, pos);
  const v = node.visibleWhen;
  return [
    `${indent}<!-- ${commentSafe(`#${node.id} is shown only when ${v.key} ${v.op}${v.value !== undefined ? ` ${v.value}` : ''} (applied in Java)`)} -->`,
    open('FrameLayout', [['android:id', track(ctx, node, 'FrameLayout', 'wrap', 'wrap')], ...place(pos, node, node.kind === 'container' ? 'match' : pos.dir === 'h' ? 'wrap' : 'match')], indent, false),
    ...inner(indent + '    ', { dir: 'v', first: true, gap: 0 }),
    `${indent}</FrameLayout>`,
  ];
}

function children(ctx: Ctx, c: ContainerNode, indent: string, dir: 'v' | 'h'): string[] {
  const gap = typeof c.props.gap === 'number' ? c.props.gap : 8;
  return c.children.flatMap((ch, i) => emit(ctx, ch, indent, { dir, first: i === 0, gap }));
}

const containerId = (_ctx: Ctx, c: ContainerNode) => `@+id/${snake(c.id)}`;

/** Grid column count, clamped to the catalog's 1–6 */
export const gridColumns = (c: Node) => Math.max(1, Math.min(6, Math.round(Number(c.props.columns ?? 2)) || 2));

/** alert tones: solid fills that read on ATAK's dark panes (warning keeps dark text for contrast) */
export const ALERT_COLORS: Record<string, { bg: string; fg: string }> = {
  info: { bg: '#1565C0', fg: '#FFFFFF' }, success: { bg: '#2E7D32', fg: '#FFFFFF' },
  warning: { bg: '#F9A825', fg: '#000000' }, danger: { bg: '#C62828', fg: '#FFFFFF' },
};

function container(ctx: Ctx, c: ContainerNode, ind: string, pos: Pos): string[] {
  const i2 = ind + '    ';
  const out: string[] = [];
  const pad: Attrs = pos.root ? [['android:padding', DP(8)]] : [];
  switch (c.type) {
    case 'stack':
    case 'row': {
      const h = c.type === 'row';
      const gravity = h ? ({ start: 'top', center: 'center_vertical', end: 'bottom' } as Record<string, string>)[String(c.props.align ?? 'center')] : undefined;
      out.push(open('LinearLayout', [['android:id', containerId(ctx, c)], ...place(pos, c, 'match'), ['android:orientation', h ? 'horizontal' : 'vertical'], ['android:gravity', gravity], ...pad], ind, false));
      if (h && c.props.wrap) out.push(`${i2}<!-- wrap: LinearLayout can't wrap; switch to a FlexboxLayout if the row overflows -->`);
      out.push(...children(ctx, c, i2, h ? 'h' : 'v'), `${ind}</LinearLayout>`);
      return out;
    }
    case 'grid': {
      // GridLayout's column weights need API 21 attrs and fight wrap_content; rows of weighted
      // LinearLayouts give the same equal columns with the placement code every other block uses
      const cols = gridColumns(c);
      const gap = typeof c.props.gap === 'number' ? c.props.gap : 8;
      out.push(open('LinearLayout', [['android:id', containerId(ctx, c)], ...place(pos, c, 'match'), ['android:orientation', 'vertical'], ...pad], ind, false));
      for (let r = 0; r * cols < c.children.length; r++) {
        const cells = c.children.slice(r * cols, r * cols + cols);
        out.push(open('LinearLayout', [['android:layout_width', 'match_parent'], ['android:layout_height', 'wrap_content'], ['android:orientation', 'horizontal'], ['android:layout_marginTop', r && gap ? DP(gap) : undefined]], i2, false));
        cells.forEach((ch, k) => out.push(...emit(ctx, ch, i2 + '    ', { dir: 'h', first: k === 0, gap, fill: true })));
        // empty cells keep the last row's columns the same width as the rows above
        for (let k = cells.length; k < cols; k++) out.push(open('View', [['android:layout_width', '0dp'], ['android:layout_height', '1dp'], ['android:layout_weight', '1'], ['android:layout_marginStart', gap ? DP(gap) : undefined]], i2 + '    ', true));
        out.push(`${i2}</LinearLayout>`);
      }
      out.push(`${ind}</LinearLayout>`);
      return out;
    }
    case 'section': {
      out.push(open('LinearLayout', [['android:id', containerId(ctx, c)], ...place(pos, c, 'match'), ['android:orientation', 'vertical'], ['android:background', `@drawable/${ctx.res.prefix}_section_bg`], ['android:padding', DP(8)]], ind, false));
      if (c.props.title) out.push(open('TextView', [['android:layout_width', 'match_parent'], ['android:layout_height', 'wrap_content'], ['android:layout_marginBottom', DP(6)], ['android:text', str(ctx.res, c.id, 'title', String(c.props.title))], ['android:textAllCaps', 'true'], ['android:textStyle', 'bold'], ['android:textSize', '12sp'], ['android:textColor', `@color/${ctx.res.prefix}_accent`]], i2, true));
      out.push(...children(ctx, c, i2, 'v'), `${ind}</LinearLayout>`);
      return out;
    }
    case 'collapsible': {
      out.push(open('LinearLayout', [['android:id', containerId(ctx, c)], ...place(pos, c, 'match'), ['android:orientation', 'vertical'], ['android:background', `@drawable/${ctx.res.prefix}_section_bg`]], ind, false));
      out.push(open('TextView', [['android:id', track(ctx, c, 'TextView', 'header', 'header')], ['android:layout_width', 'match_parent'], ['android:layout_height', 'wrap_content'], ['android:padding', DP(10)], ['android:text', str(ctx.res, c.id, 'title', String(c.props.title ?? ''))], ['android:textStyle', 'bold'], ['android:clickable', 'true'], ['android:focusable', 'true']], i2, true));
      out.push(open('LinearLayout', [['android:id', track(ctx, c, 'LinearLayout', 'body', 'body')], ['android:layout_width', 'match_parent'], ['android:layout_height', 'wrap_content'], ['android:orientation', 'vertical'], ['android:padding', DP(8)], ['android:visibility', c.props.startOpen === false ? 'gone' : 'visible']], i2, false));
      out.push(...children(ctx, c, i2 + '    ', 'v'), `${i2}</LinearLayout>`, `${ind}</LinearLayout>`);
      return out;
    }
    case 'scroll': {
      out.push(open('ScrollView', [['android:id', containerId(ctx, c)], ...place(pos, c, 'match'), ['android:fillViewport', 'true']], ind, false));
      out.push(open('LinearLayout', [['android:layout_width', 'match_parent'], ['android:layout_height', 'wrap_content'], ['android:orientation', 'vertical'], ...pad], i2, false));
      out.push(...children(ctx, c, i2 + '    ', 'v'), `${i2}</LinearLayout>`, `${ind}</ScrollView>`);
      return out;
    }
    case 'tabs': {
      out.push(open('LinearLayout', [['android:id', containerId(ctx, c)], ...place(pos, c, 'match'), ['android:orientation', 'vertical'], ...pad], ind, false));
      out.push(open('LinearLayout', [['android:layout_width', 'match_parent'], ['android:layout_height', 'wrap_content'], ['android:orientation', 'horizontal']], i2, false));
      c.children.forEach((tab, i) => {
        out.push(open('Button', [['android:id', track(ctx, c, 'Button', 'tab', `tab${i + 1}`, { tabIndex: i })], ['android:layout_width', '0dp'], ['android:layout_height', 'wrap_content'], ['android:layout_weight', '1'], ['android:text', str(ctx.res, `${c.id}-tab${i + 1}`, 'title', String(tab.props.title ?? `Tab ${i + 1}`))], ['style', '?android:attr/borderlessButtonStyle']], i2 + '    ', true));
      });
      out.push(`${i2}</LinearLayout>`);
      out.push(open('FrameLayout', [['android:layout_width', 'match_parent'], ['android:layout_height', 'wrap_content']], i2, false));
      c.children.forEach((tab, i) => {
        // pages are tracked so the holder can switch them; the first tab shows by default (set in Java)
        const page = withOverrides(tab, 'atak');
        out.push(...emit(ctx, page, i2 + '    ', { dir: 'v', first: true, gap: 0 }));
        if (page.kind === 'container') {
          ctx.views.push({ node: page, field: camel(page.id + '-page'), resId: snake(page.id), javaType: 'View', role: 'body', tabIndex: i });
        }
      });
      out.push(`${i2}</FrameLayout>`, `${ind}</LinearLayout>`);
      return out;
    }
    case 'list':
      return listView(ctx, c, ind, pos, false, []);
  }
}

function listView(ctx: Ctx, node: Node, ind: string, pos: Pos, isTable: boolean, columns: string[]): string[] {
  const field = fieldFor(ctx, node.bind);
  const rowLayout = `${ctx.res.prefix}_row_${snake(node.id)}`;
  const view: ViewRec = { node, field: camel(node.id), resId: snake(node.id), javaType: 'ListView', role: 'main' };
  ctx.views.push(view);
  const emptyText = String(node.props.emptyText ?? 'Nothing here yet');
  const out: string[] = [];
  const i2 = ind + '    ';
  out.push(open('LinearLayout', [...place(pos, node, 'match'), ['android:orientation', 'vertical']], ind, false));
  if (isTable) {
    out.push(open('LinearLayout', [['android:layout_width', 'match_parent'], ['android:layout_height', 'wrap_content'], ['android:orientation', 'horizontal'], ['android:paddingBottom', DP(4)]], i2, false));
    for (const col of columns) out.push(open('TextView', [['android:layout_width', '0dp'], ['android:layout_height', 'wrap_content'], ['android:layout_weight', '1'], ['android:text', str(ctx.res, `${node.id}-${col}`, 'header', col)], ['android:textStyle', 'bold'], ['android:textColor', `@color/${ctx.res.prefix}_accent`]], i2 + '    ', true));
    out.push(`${i2}</LinearLayout>`);
  }
  out.push(open('ListView', [['android:id', `@+id/${view.resId}`], ['android:layout_width', 'match_parent'], ['android:layout_height', 'wrap_content'], ['android:divider', `@color/${ctx.res.prefix}_divider`], ['android:dividerHeight', node.props.dividers === false ? '0dp' : '1dp']], i2, true));
  const empty: ViewRec = { node, field: camel(node.id + '-empty'), resId: snake(node.id) + '_empty', javaType: 'TextView', role: 'empty' };
  ctx.views.push(empty);
  out.push(open('TextView', [['android:id', `@+id/${empty.resId}`], ['android:layout_width', 'match_parent'], ['android:layout_height', 'wrap_content'], ['android:padding', DP(12)], ['android:gravity', 'center'], ['android:textStyle', 'italic'], ['android:text', str(ctx.res, node.id, 'empty', emptyText)]], i2, true));
  out.push(`${ind}</LinearLayout>`);

  // the row layout: its own file, its own view records
  const rowCtx: Ctx = { ...ctx, views: [], scope: field?.type === 'list' ? field : undefined };
  let rowBody: string[];
  if (isTable) {
    rowBody = [open('LinearLayout', [[NS, undefined], ['android:layout_width', 'match_parent'], ['android:layout_height', 'wrap_content'], ['android:orientation', 'horizontal'], ['android:padding', DP(6)]], '', false)];
    for (const col of columns) {
      const id = `${node.id}-${col}`;
      rowCtx.views.push({ node: { id, kind: 'element', type: 'label', props: {}, bind: `$item.${col}` }, field: camel(id), resId: snake(id), javaType: 'TextView', role: 'main' });
      rowBody.push(open('TextView', [['android:id', `@+id/${snake(id)}`], ['android:layout_width', '0dp'], ['android:layout_height', 'wrap_content'], ['android:layout_weight', '1']], '    ', true));
    }
    rowBody.push('</LinearLayout>');
  } else {
    const c = node as ContainerNode;
    rowBody = [open('LinearLayout', [[NS, undefined], ['android:layout_width', 'match_parent'], ['android:layout_height', 'wrap_content'], ['android:orientation', 'vertical'], ['android:padding', DP(8)]], '', false)];
    rowBody.push(...c.children.flatMap((ch, i) => emit(rowCtx, ch, '    ', { dir: 'v', first: i === 0, gap: 6 })));
    rowBody.push('</LinearLayout>');
  }
  ctx.rows.push({ name: rowLayout, xml: `<?xml version="1.0" encoding="utf-8"?>\n<!-- ${commentSafe(`One row of #${node.id} (bound to ${node.bind ?? '?'}).`)} -->\n${rowBody.join('\n')}\n` });
  ctx.lists.push({ node, view, field, rowLayout, rowViews: rowCtx.views, isTable, columns });
  return out;
}

/** Label above an input, when the design gives one */
function labelled(ctx: Ctx, node: ElementNode, ind: string, pos: Pos, inner: (i: string) => string[]): string[] {
  const label = typeof node.props.label === 'string' && node.props.label ? node.props.label : undefined;
  if (!label || ['checkbox', 'toggle'].includes(node.type)) return inner(ind);
  return [
    open('LinearLayout', [...place(pos, node, 'match'), ['android:orientation', 'vertical']], ind, false),
    open('TextView', [['android:layout_width', 'wrap_content'], ['android:layout_height', 'wrap_content'], ['android:text', str(ctx.res, node.id, 'label', label)], ['android:textSize', '12sp'], ['android:textColor', `@color/${ctx.res.prefix}_muted`]], ind + '    ', true),
    ...inner(ind + '    '),
    `${ind}</LinearLayout>`,
  ];
}

function element(ctx: Ctx, node: ElementNode, ind: string, pos: Pos): string[] {
  const spec = componentSpec('element', node.type);
  const p = node.props;
  const s = (prop: string, fallback = '') => (typeof p[prop] === 'string' && p[prop] ? String(p[prop]) : fallback);
  const textRes = (prop: string, fallback = '') => str(ctx.res, node.id, prop, s(prop, fallback));
  const field = fieldFor(ctx, node.bind);
  const comment = node.visibleWhen ? [`${ind}<!-- #${node.id}: shown only when ${node.visibleWhen.key} ${node.visibleWhen.op} ${node.visibleWhen.value ?? ''} (applied in Java) -->`] : [];
  // inner elements of a labelled wrapper sit flush; the wrapper takes the parent's spacing
  const wrapped = typeof p.label === 'string' && p.label && !['checkbox', 'toggle'].includes(node.type);
  const own = (w: 'match' | 'wrap'): Attrs => (wrapped ? [['android:layout_width', w === 'match' ? 'match_parent' : 'wrap_content'], ['android:layout_height', 'wrap_content']] : place(pos, node, w));
  const single = (tag: string, role: Role, attrs: Attrs, w: 'match' | 'wrap' = 'match'): string[] =>
    labelled(ctx, node, ind, pos, (i) => [open(tag, [['android:id', track(ctx, node, tag, role)], ...own(w), ...attrs], i, true)]);

  let lines: string[];
  switch (node.type) {
    case 'heading': {
      const size = { '1': '20sp', '2': '17sp', '3': '14sp' }[s('level', '2')] ?? '17sp';
      lines = single('TextView', 'main', [['android:text', textRes('text')], ['android:textSize', size], ['android:textStyle', 'bold']]);
      break;
    }
    case 'label':
      lines = single('TextView', 'main', [['android:text', node.bind ? undefined : textRes('text')], ['android:textColor', p.muted ? `@color/${ctx.res.prefix}_muted` : undefined]], pos.dir === 'h' ? 'wrap' : 'match');
      break;
    case 'button':
    case 'open-on-map':
    case 'map-item-ref':
    case 'contact-picker':
    case 'cot-type-picker':
    case 'datetime':
    case 'color-picker': {
      const text = node.type === 'button' ? s('text') : node.type === 'open-on-map' ? s('text', 'Show on map')
        : node.type === 'contact-picker' ? 'Choose contact…' : node.type === 'cot-type-picker' ? 'Choose type…'
          : node.type === 'datetime' ? 'Pick date/time…' : node.type === 'color-picker' ? 'Pick color…' : s('label', 'Map item');
      const style = s('style', 'primary');
      lines = single('Button', 'action', [['android:text', str(ctx.res, node.id, 'text', text)],
        ['android:backgroundTint', style === 'danger' ? `@color/${ctx.res.prefix}_danger` : style === 'primary' && node.type === 'button' ? `@color/${ctx.res.prefix}_primary` : undefined],
        ['style', style === 'subtle' ? '?android:attr/borderlessButtonStyle' : undefined]], pos.dir === 'h' || !p.fullWidth ? 'wrap' : 'match');
      break;
    }
    case 'icon-button':
      lines = [`${ind}<!-- TODO icon: ${commentSafe(s('icon'))} -->`, ...single('ImageButton', 'action', [['android:src', '@android:drawable/ic_menu_info_details'], ['android:contentDescription', textRes('tooltip')]], 'wrap')];
      break;
    case 'text-input':
    case 'number-input':
    case 'text-area':
    case 'coordinate-field': {
      const area = node.type === 'text-area';
      const readOnly = node.type === 'coordinate-field' && p.readOnly === true;
      const inputType = node.type === 'number-input' ? 'numberDecimal|numberSigned' : area ? 'textMultiLine|textCapSentences' : 'text';
      lines = readOnly
        ? single('TextView', 'main', [['android:fontFamily', 'monospace']])
        : single('EditText', 'input', [['android:inputType', inputType], ['android:hint', s('placeholder') ? textRes('placeholder') : node.type === 'coordinate-field' ? str(ctx.res, node.id, 'placeholder', 'MGRS or lat, lon') : undefined],
          ['android:minLines', area ? Number(p.rows ?? 3) : undefined], ['android:gravity', area ? 'top|start' : undefined], ['android:fontFamily', node.type === 'coordinate-field' ? 'monospace' : undefined]]);
      break;
    }
    case 'dropdown': {
      const opts = optionsOf(node, field);
      const arr = `${ctx.res.prefix}_${snake(node.id)}_options`;
      ctx.res.arrays.set(arr, opts.map((o) => o.label));
      lines = single('Spinner', 'input', [['android:entries', `@array/${arr}`]]);
      break;
    }
    case 'checkbox':
    case 'toggle':
      lines = single(node.type === 'checkbox' ? 'CheckBox' : 'Switch', 'input', [['android:text', textRes('label')]]);
      break;
    case 'radio-group': {
      const opts = optionsOf(node, field);
      const radios: [string, string][] = opts.map((o) => [`${snake(node.id)}_${snake(o.value)}`, o.value]);
      lines = labelled(ctx, node, ind, pos, (i) => [
        open('RadioGroup', [['android:id', track(ctx, node, 'RadioGroup', 'input', '', { radios })], ...own('match'), ['android:orientation', p.horizontal ? 'horizontal' : 'vertical']], i, false),
        ...opts.map((o, k) => open('RadioButton', [['android:id', `@+id/${radios[k]![0]}`], ['android:layout_width', 'wrap_content'], ['android:layout_height', 'wrap_content'], ['android:text', str(ctx.res, `${node.id}-${o.value}`, 'label', o.label)], ['android:layout_marginEnd', p.horizontal ? DP(12) : undefined]], i + '    ', true)),
        `${i}</RadioGroup>`,
      ]);
      break;
    }
    case 'slider':
      lines = single('SeekBar', 'input', [['android:max', Number(p.max ?? 100) - Number(p.min ?? 0)]]);
      break;
    case 'image':
      lines = [`${ind}<!-- TODO image: ${commentSafe(s('hint', s('alt')))} -->`, ...single('ImageView', 'main', [['android:layout_height', undefined], ['android:minHeight', DP(Number(p.height ?? 96))], ['android:src', '@android:drawable/ic_menu_gallery'], ['android:scaleType', 'centerInside'], ['android:contentDescription', textRes('alt')]])];
      break;
    case 'divider':
      lines = [open('View', [['android:layout_width', 'match_parent'], ['android:layout_height', '1dp'], ...(!pos.first && pos.gap ? [['android:layout_marginTop', DP(pos.gap)] as [string, string]] : []), ['android:background', `@color/${ctx.res.prefix}_divider`]], ind, true)];
      break;
    case 'progress':
      lines = single('ProgressBar', 'main', [['style', '?android:attr/progressBarStyleHorizontal'], ['android:max', Number(p.max ?? 100)], ['android:indeterminate', node.bind ? 'false' : 'true']]);
      break;
    case 'status-badge':
      lines = single('TextView', 'main', [['android:background', `@drawable/${ctx.res.prefix}_badge`], ['android:paddingStart', DP(8)], ['android:paddingEnd', DP(8)], ['android:paddingTop', DP(2)], ['android:paddingBottom', DP(2)], ['android:textColor', '#FFFFFF'], ['android:textStyle', 'bold'], ['android:textSize', p.size === 'large' ? '16sp' : '12sp']], 'wrap');
      break;
    case 'empty-state':
      lines = single('TextView', 'main', [['android:text', textRes('text')], ['android:gravity', 'center'], ['android:padding', DP(16)], ['android:textStyle', 'italic'], ['android:textColor', `@color/${ctx.res.prefix}_muted`]]);
      break;
    case 'alert': {
      const c = ALERT_COLORS[s('tone', 'info')] ?? ALERT_COLORS.info!;
      lines = single('TextView', 'main', [['android:text', node.bind ? undefined : textRes('text')], ['android:background', c.bg], ['android:textColor', c.fg], ['android:padding', DP(10)]]);
      break;
    }
    case 'stat':
      lines = [
        open('LinearLayout', [...place(pos, node, 'match'), ['android:orientation', 'vertical'], ['android:gravity', 'center_horizontal'], ['android:background', `@drawable/${ctx.res.prefix}_section_bg`], ['android:padding', DP(8)]], ind, false),
        open('TextView', [['android:id', track(ctx, node, 'TextView', 'main')], ['android:layout_width', 'wrap_content'], ['android:layout_height', 'wrap_content'], ['android:text', node.bind ? undefined : '—'], ['android:textSize', '26sp'], ['android:textStyle', 'bold']], ind + '    ', true),
        open('TextView', [['android:layout_width', 'wrap_content'], ['android:layout_height', 'wrap_content'], ['android:text', textRes('caption')], ['android:textSize', '12sp'], ['android:gravity', 'center'], ['android:textColor', `@color/${ctx.res.prefix}_muted`]], ind + '    ', true),
        `${ind}</LinearLayout>`,
      ];
      break;
    case 'timer':
      // text + color are set by the Views class, which re-renders once a second while the pane is attached
      lines = single('TextView', 'main', [['android:text', '--:--'], ['android:textSize', '24sp'], ['android:textStyle', 'bold'], ['android:fontFamily', 'monospace']], pos.dir === 'h' ? 'wrap' : 'match');
      break;
    case 'loading':
      lines = [
        open('LinearLayout', [...place(pos, node, 'match'), ['android:orientation', 'horizontal'], ['android:gravity', 'center_vertical']], ind, false),
        open('ProgressBar', [['android:layout_width', DP(20)], ['android:layout_height', DP(20)], ['android:indeterminate', 'true']], ind + '    ', true),
        open('TextView', [['android:layout_width', 'wrap_content'], ['android:layout_height', 'wrap_content'], ['android:layout_marginStart', DP(10)], ['android:text', textRes('text', 'Loading…')], ['android:textColor', `@color/${ctx.res.prefix}_muted`]], ind + '    ', true),
        `${ind}</LinearLayout>`,
      ];
      break;
    case 'callsign':
      lines = single('TextView', 'main', [['android:textStyle', 'bold']], 'wrap');
      break;
    case 'table':
      return [...comment, ...listView(ctx, node, ind, pos, true, Array.isArray(p.columns) ? (p.columns as string[]) : [])];
    case 'map-point-picker':
    case 'data-package-attach':
    case 'chat-send': {
      const isChat = node.type === 'chat-send';
      const valueTag = isChat ? 'EditText' : 'TextView';
      const btnText = node.type === 'map-point-picker' ? s('buttonText', 'Pick on map') : isChat ? 'Send' : 'Attach';
      lines = labelled(ctx, node, ind, pos, (i) => [
        open('LinearLayout', [...own('match'), ['android:orientation', 'horizontal'], ['android:gravity', 'center_vertical']], i, false),
        open(valueTag, [['android:id', track(ctx, node, valueTag, isChat ? 'input' : 'value', 'value')], ['android:layout_width', '0dp'], ['android:layout_height', 'wrap_content'], ['android:layout_weight', '1'],
          ...(isChat ? [['android:hint', textRes('placeholder', 'Message')], ['android:inputType', 'textShortMessage']] as Attrs : [['android:text', str(ctx.res, node.id, 'value', node.type === 'map-point-picker' ? 'Not set' : 'No file')]] as Attrs)], i + '    ', true),
        open('Button', [['android:id', track(ctx, node, 'Button', 'action', 'button')], ['android:layout_width', 'wrap_content'], ['android:layout_height', 'wrap_content'], ['android:text', str(ctx.res, node.id, 'button', btnText)]], i + '    ', true),
        `${i}</LinearLayout>`,
      ]);
      break;
    }
    default:
      lines = [`${ind}<!-- TODO unknown component "${xmlEsc(node.type)}" (#${node.id}) -->`];
  }
  if (spec?.support.atak === 'approx') lines.unshift(`${ind}<!-- ${commentSafe(`${spec.label}: no stock ATAK widget, approximated here. Refine to match the mockup.`)} -->`);
  return [...comment, ...lines];
}

/** ATAK settings screens become a PreferenceScreen; keys match PluginState's SharedPreferences keys */
export function prefsXml(p: Project, screen: Screen, res: ResSink, prefKey: (key: string) => string): string {
  const out: string[] = ['<?xml version="1.0" encoding="utf-8"?>', `<!-- ${commentSafe(`Settings screen "${screen.title}" (#${screen.id}). Keys match PluginState.load()/save().`)} -->`, `<PreferenceScreen ${NS}>`];
  const walkPrefs = (n: Node, ind: string) => {
    const node = withOverrides(n, 'atak');
    if (hiddenOn(node, 'atak')) return;
    if (node.kind === 'container') {
      const titled = node.type === 'section' || node.type === 'collapsible';
      if (titled && node.props.title) out.push(`${ind}<PreferenceCategory android:title="${str(res, node.id, 'title', String(node.props.title))}">`);
      for (const c of node.children) walkPrefs(c, titled && node.props.title ? ind + '    ' : ind);
      if (titled && node.props.title) out.push(`${ind}</PreferenceCategory>`);
      return;
    }
    const f = node.bind && !node.bind.startsWith('$') ? p.state.find((x) => x.key === node.bind) : undefined;
    const title = String(node.props.label ?? node.props.text ?? f?.label ?? node.id);
    const t = str(res, node.id, 'pref_title', title);
    const key = f ? prefKey(f.key) : `${res.prefix}_${snake(node.id)}`;
    const def = f?.default !== undefined && f.default !== null && f.default !== '' ? ` android:defaultValue="${xmlEsc(String(f.default))}"` : '';
    if (['text-input', 'text-area', 'number-input'].includes(node.type)) {
      out.push(`${ind}<EditTextPreference android:key="${key}" android:title="${t}"${def}${node.type === 'number-input' ? ' android:inputType="numberDecimal"' : ''} />`);
    } else if (node.type === 'toggle') {
      out.push(`${ind}<SwitchPreference android:key="${key}" android:title="${t}"${def} />`);
    } else if (node.type === 'checkbox') {
      out.push(`${ind}<CheckBoxPreference android:key="${key}" android:title="${t}"${def} />`);
    } else if ((node.type === 'dropdown' || node.type === 'radio-group') && f) {
      const opts = optionsOf(node, f);
      const labels = `${res.prefix}_${snake(node.id)}_pref_labels`;
      const values = `${res.prefix}_${snake(node.id)}_pref_values`;
      res.arrays.set(labels, opts.map((o) => o.label));
      res.arrays.set(values, opts.map((o) => o.value));
      out.push(`${ind}<ListPreference android:key="${key}" android:title="${t}" android:entries="@array/${labels}" android:entryValues="@array/${values}"${def} />`);
    } else {
      out.push(`${ind}<!-- TODO ${commentSafe(`${node.type} #${node.id}${node.on ? `: on ${Object.keys(node.on).join('/')} run ${Object.values(node.on).join(', ')}` : ''}`)} -->`);
      out.push(`${ind}<Preference android:key="${key}" android:title="${t}" />`);
    }
  };
  walkPrefs(screen.root, '    ');
  out.push('</PreferenceScreen>', '');
  return out.join('\n');
}

export function resourcesXml(res: ResSink): string {
  const out = ['<?xml version="1.0" encoding="utf-8"?>', `<!-- Strings for generated layouts. Prefixed "${res.prefix}_" so they can't collide with the template's. -->`, '<resources>'];
  for (const [k, v] of [...res.strings].sort(([a], [b]) => a.localeCompare(b))) out.push(`    <string name="${k}">${androidStr(v)}</string>`);
  for (const [k, vals] of [...res.arrays].sort(([a], [b]) => a.localeCompare(b))) {
    out.push(`    <string-array name="${k}">`, ...vals.map((v) => `        <item>${androidStr(v)}</item>`), '    </string-array>');
  }
  out.push('</resources>', '');
  return out.join('\n');
}
