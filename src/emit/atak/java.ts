// ATAK emitter, part 2: Java. Three kinds of file, all plain Android (compile against
// android.jar alone, no ATAK SDK), so the agent can wire them into any plugin template:
//   PluginState  — the data fields, typed; enum constants/labels/colors; SharedPreferences load/save
//   Actions      — one method per action; the Javadoc IS the designer's intent
//   <Screen>Views — finds views, writes input changes into state, calls actions, render() pushes state back

import { walk } from '../../spec/tree';
import type { Node, Project, StateField } from '../../spec/types';
import { camel, commentSafe, HEADER_NOTE, javaIdent, pascal, strLit, upperSnake } from '../common';
import { optionsOf, type ListRec, type ScreenPlan, type ViewRec } from './layout';

/** How a data field appears in Java */
export interface JField {
  f: StateField;
  /** expression owner: "state" for top-level, "item" inside a row */
  name: string;
  /** e.g. "PluginState" or "PluginState.TeamItem": where its constants live */
  owner: string;
  constPrefix: string;
  /** item class for lists */
  itemClass?: string;
}

export interface JavaModel {
  pkg: string;
  top: Map<string, JField>;
  /** list field → its item fields by key */
  items: Map<StateField, Map<string, JField>>;
  byField: Map<StateField, JField>;
}

const J = '    ';

function javaType(f: StateField, itemClass?: string): string {
  switch (f.type) {
    case 'number': return 'double';
    case 'boolean': return 'boolean';
    case 'datetime': return 'long';
    case 'point': return 'double[]';
    case 'list': return `List<${itemClass}>`;
    default: return 'String';
  }
}

function defaultExpr(f: JField): string {
  const d = f.f.default;
  switch (f.f.type) {
    case 'number': return typeof d === 'number' ? String(d) : '0';
    case 'boolean': return d === true ? 'true' : 'false';
    case 'datetime': return '0L';
    case 'point': return 'null';
    case 'list': return 'new ArrayList<>()';
    case 'enum': {
      const v = typeof d === 'string' && d ? d : f.f.options?.[0]?.value;
      return v ? `${f.constPrefix}${upperSnake(v)}` : 'null';
    }
    default: return typeof d === 'string' && d ? strLit(d) : 'null';
  }
}

export function buildModel(p: Project): JavaModel {
  const m: JavaModel = { pkg: `${p.meta.packageId}.ui`, top: new Map(), items: new Map(), byField: new Map() };
  const visit = (fields: StateField[], owner: string, into: Map<string, JField>) => {
    for (const f of fields) {
      const jf: JField = { f, name: javaIdent(f.key), owner, constPrefix: `${owner}.${upperSnake(f.key)}_` };
      if (f.type === 'list') {
        jf.itemClass = `${owner}.${pascal(f.key)}Item`;
        const inner = new Map<string, JField>();
        m.items.set(f, inner);
        visit(f.itemFields ?? [], jf.itemClass, inner);
      }
      into.set(f.key, jf);
      m.byField.set(f, jf);
    }
  };
  visit(p.state, 'PluginState', m.top);
  return m;
}

// ------------------------------------------------------------------ PluginState

/**
 * flavor: 'android' persists with SharedPreferences (ATAK); 'desktop' with java.util.prefs.Preferences
 * (TAKX, plain JDK). Everything else (fields, enum constants, list item classes) is shared.
 */
export function pluginStateJava(p: Project, m: JavaModel, flavor: 'android' | 'desktop' = 'android'): string {
  const desktop = flavor === 'desktop';
  const out: string[] = [
    `package ${m.pkg};`, '',
    desktop ? 'import java.util.prefs.Preferences;' : 'import android.content.SharedPreferences;', '',
    'import java.util.ArrayList;', 'import java.util.List;', '',
    '/**',
    ` * The plugin's data fields (ui-spec "state"). ${HEADER_NOTE}`,
    ' * Choice fields store their option VALUE; *_LABELS / *_COLORS give what to show.',
    ' */',
    '@SuppressWarnings({"unused", "WeakerAccess"})',
    'public final class PluginState {', '',
    desktop ? `${J}/** Key prefix inside the Preferences node (use Preferences.userNodeForPackage(PluginState.class)). */`
      : `${J}/** SharedPreferences key prefix; generated settings screens use the same keys. */`,
    `${J}public static final String PREF_PREFIX = ${strLit(p.meta.packageId + '.')};`, '',
  ];
  const fieldsBlock = (fields: StateField[], ind: string) => {
    for (const f of fields) {
      const jf = m.byField.get(f)!;
      const local = upperSnake(f.key);
      if (f.type === 'enum' && f.options?.length) {
        for (const o of f.options) out.push(`${ind}public static final String ${local}_${upperSnake(o.value)} = ${strLit(o.value)};`);
        out.push(`${ind}public static final String[] ${local}_VALUES = {${f.options.map((o) => `${local}_${upperSnake(o.value)}`).join(', ')}};`);
        out.push(`${ind}public static final String[] ${local}_LABELS = {${f.options.map((o) => strLit(o.label)).join(', ')}};`);
        out.push(`${ind}public static final String[] ${local}_COLORS = {${f.options.map((o) => (o.color ? strLit(o.color) : 'null')).join(', ')}};`);
      }
      if (f.type === 'list') {
        const cls = jf.itemClass!.split('.').pop()!;
        out.push(`${ind}/** One record of ${f.key}. */`, `${ind}public static final class ${cls} {`);
        fieldsBlock(f.itemFields ?? [], ind + J);
        out.push(`${ind}}`);
      }
      const doc = [f.label, f.description, f.type === 'point' ? `{lat, lon}; null = not set. Swap for ${desktop ? 'a TAKX ILocation' : 'ATAK GeoPoint'} in plugin code.` : '',
        f.type === 'contact' ? `TAK contact UID (look up the callsign via ${desktop ? 'TAKX' : 'ATAK'} contacts).` : '', f.type === 'datetime' ? 'Epoch millis; 0 = not set.' : '',
        f.persisted ? 'Remembered across restarts (load/save).' : ''].filter(Boolean).join(' ');
      if (doc) out.push(`${ind}/** ${commentSafe(doc)} */`);
      out.push(`${ind}public ${f.type === 'list' ? 'final ' : ''}${javaType(f, jf.itemClass?.split('.').pop())} ${jf.name} = ${defaultExpr({ ...jf, constPrefix: `${local}_` })};`, '');
    }
  };
  fieldsBlock(p.state, J);

  const persisted = p.state.filter((f) => f.persisted && f.type !== 'list');
  const getStr = desktop ? 'get' : 'getString';
  out.push(`${J}/** Restore remembered fields. */`, `${J}public void load(${desktop ? 'Preferences' : 'SharedPreferences'} prefs) {`);
  for (const f of persisted) {
    const n = m.top.get(f.key)!.name;
    const k = `PREF_PREFIX + ${strLit(f.key)}`;
    if (f.type === 'boolean') out.push(`${J}${J}${n} = prefs.getBoolean(${k}, ${n});`);
    else if (f.type === 'datetime') out.push(`${J}${J}${n} = prefs.getLong(${k}, ${n});`);
    else if (f.type === 'number') out.push(`${J}${J}${n} = parseDouble(prefs.${getStr}(${k}, null), ${n});`);
    else if (f.type === 'point') out.push(`${J}${J}${n} = parsePoint(prefs.${getStr}(${k}, null), ${n});`);
    else out.push(`${J}${J}${n} = prefs.${getStr}(${k}, ${n});`);
  }
  if (desktop) {
    // Preferences.put(key, null) throws NullPointerException: an unset value REMOVES the key instead
    out.push(`${J}}`, '', `${J}/** Write remembered fields (Preferences flushes on its own; call prefs.flush() to force). */`, `${J}public void save(Preferences prefs) {`);
    for (const f of persisted) {
      const n = m.top.get(f.key)!.name;
      const k = `PREF_PREFIX + ${strLit(f.key)}`;
      if (f.type === 'boolean') out.push(`${J}${J}prefs.putBoolean(${k}, ${n});`);
      else if (f.type === 'datetime') out.push(`${J}${J}prefs.putLong(${k}, ${n});`);
      else if (f.type === 'number') out.push(`${J}${J}prefs.put(${k}, String.valueOf(${n}));`);
      else if (f.type === 'point') out.push(`${J}${J}if (${n} == null) prefs.remove(${k}); else prefs.put(${k}, ${n}[0] + "," + ${n}[1]);`);
      else out.push(`${J}${J}if (${n} == null) prefs.remove(${k}); else prefs.put(${k}, ${n});`);
    }
  } else {
    out.push(`${J}}`, '', `${J}/** Write remembered fields; call editor.apply() afterwards. */`, `${J}public void save(SharedPreferences.Editor editor) {`);
    for (const f of persisted) {
      const n = m.top.get(f.key)!.name;
      const k = `PREF_PREFIX + ${strLit(f.key)}`;
      if (f.type === 'boolean') out.push(`${J}${J}editor.putBoolean(${k}, ${n});`);
      else if (f.type === 'datetime') out.push(`${J}${J}editor.putLong(${k}, ${n});`);
      else if (f.type === 'number') out.push(`${J}${J}editor.putString(${k}, String.valueOf(${n})); // EditTextPreference stores strings`);
      else if (f.type === 'point') out.push(`${J}${J}editor.putString(${k}, ${n} == null ? null : ${n}[0] + "," + ${n}[1]);`);
      else out.push(`${J}${J}editor.putString(${k}, ${n});`);
    }
  }
  out.push(`${J}}`, '',
    `${J}public static String labelOf(String[] values, String[] labels, String value) {`,
    `${J}${J}for (int i = 0; i < values.length; i++) if (values[i].equals(value)) return labels[i];`,
    `${J}${J}return value == null ? "" : value;`, `${J}}`, '',
    `${J}public static String colorOf(String[] values, String[] colors, String value) {`,
    `${J}${J}for (int i = 0; i < values.length; i++) if (values[i].equals(value)) return colors[i];`,
    `${J}${J}return null;`, `${J}}`, '',
    `${J}public static int indexOf(String[] values, String value) {`,
    `${J}${J}for (int i = 0; i < values.length; i++) if (values[i].equals(value)) return i;`,
    `${J}${J}return -1;`, `${J}}`, '',
    `${J}static double parseDouble(String s, double fallback) {`,
    `${J}${J}if (s == null) return fallback;`,
    `${J}${J}try { return Double.parseDouble(s.trim()); } catch (NumberFormatException e) { return fallback; /* not a number: keep the old value */ }`,
    `${J}}`, '',
    `${J}static double[] parsePoint(String s, double[] fallback) {`,
    `${J}${J}if (s == null) return fallback;`,
    `${J}${J}String[] parts = s.split(",");`,
    `${J}${J}if (parts.length != 2) return fallback;`,
    `${J}${J}double lat = parseDouble(parts[0], Double.NaN), lon = parseDouble(parts[1], Double.NaN);`,
    `${J}${J}return Double.isNaN(lat) || Double.isNaN(lon) ? fallback : new double[] {lat, lon};`,
    `${J}}`, '}', '');
  return out.join('\n');
}

// ------------------------------------------------------------------ Actions

/** Item type an action receives when a list triggers it (null when nothing list-based does) */
export function actionParams(p: Project, m: JavaModel): Map<string, string | null> {
  const res = new Map<string, string | null>(p.actions.map((a) => [a.id, null]));
  for (const s of p.screens) {
    for (const n of walk(s.root)) {
      const ev = n.on?.itemClick ?? n.on?.rowClick;
      if (!ev || !n.bind || n.bind.startsWith('$')) continue;
      const f = p.state.find((x) => x.key === n.bind);
      const cls = f ? m.byField.get(f)?.itemClass : undefined;
      if (!cls) continue;
      const prev = res.get(ev);
      res.set(ev, prev && prev !== cls ? 'Object' : cls);
    }
  }
  return res;
}

export function actionsJava(p: Project, m: JavaModel): string {
  const params = actionParams(p, m);
  const triggers = new Map<string, string[]>();
  for (const s of p.screens) for (const n of walk(s.root)) for (const [ev, a] of Object.entries(n.on ?? {})) triggers.set(a, [...(triggers.get(a) ?? []), `#${n.id} (${ev})`]);
  const out = [
    `package ${m.pkg};`, '',
    '/**',
    ` * Everything the plugin's UI can ask for. ${HEADER_NOTE}`,
    ' * Implement this once (usually in the drop-down receiver) and pass it to each *Views class.',
    ' * Each Javadoc is the designer\'s description of the behavior: build exactly that.',
    ' */',
    'public interface Actions {',
  ];
  for (const a of p.actions) {
    const param = params.get(a.id);
    out.push('', `${J}/**`, `${J} * ${commentSafe(a.label)} [${a.kind}${a.params && Object.keys(a.params).length ? `: ${Object.entries(a.params).map(([k, v]) => `${k}=${v}`).join(', ')}` : ''}]`,
      `${J} * <p>${commentSafe(a.intent || 'TODO: no description; ask the designer.')}</p>`,
      `${J} * Triggered by: ${commentSafe((triggers.get(a.id) ?? ['nothing yet']).join(', '))}`,
      ...(param ? [`${J} * @param item the tapped row${params.get(a.id) && (triggers.get(a.id) ?? []).some((t) => !/itemClick|rowClick/.test(t)) ? ' (null when triggered from elsewhere)' : ''}`] : []),
      `${J} */`, `${J}void ${javaIdent(camel(a.id))}(${param ? `${param.replace(/^PluginState\./, 'PluginState.')} item` : ''});`);
  }
  out.push('}', '');
  return out.join('\n');
}

// ------------------------------------------------------------------ <Screen>Views

const VIEW_IMPORTS = ['android.graphics.Color', 'android.text.Editable', 'android.text.TextWatcher', 'android.view.LayoutInflater', 'android.view.View', 'android.view.ViewGroup',
  'android.widget.AdapterView', 'android.widget.BaseAdapter', 'android.widget.Button', 'android.widget.CheckBox', 'android.widget.CompoundButton', 'android.widget.EditText',
  'android.widget.FrameLayout', 'android.widget.ImageButton', 'android.widget.ImageView', 'android.widget.LinearLayout', 'android.widget.ListAdapter', 'android.widget.ListView',
  'android.widget.ProgressBar', 'android.widget.RadioGroup', 'android.widget.ScrollView', 'android.widget.SeekBar', 'android.widget.Spinner', 'android.widget.Switch', 'android.widget.TextView'];

/** Timer formatting for epoch-millis datetimes (0 = not set). Shared with the TAKX emitter, which stores time the same way. */
export const CLOCK_HELPERS = [
  '/** Time since t (elapsed) or until t (countdown) as [-]mm:ss or h:mm:ss; "--:--" when t isn\'t set */',
  'private static String clock(long t, boolean countdown) {',
  '    if (t == 0L) return "--:--";',
  '    long ms = countdown ? t - System.currentTimeMillis() : System.currentTimeMillis() - t;',
  '    String sign = ms < 0 ? "-" : "";',
  '    long s = Math.abs(ms) / 1000L;',
  '    return s >= 3600L ? String.format(Locale.US, "%s%d:%02d:%02d", sign, s / 3600L, (s / 60L) % 60L, s % 60L)',
  '        : String.format(Locale.US, "%s%02d:%02d", sign, s / 60L, s % 60L);',
  '}',
  '/** Past the warning point: elapsed >= warn, or countdown remaining <= warn (warn < 0 = only once overdue) */',
  'private static boolean overdue(long t, boolean countdown, long warnMs) {',
  '    if (t == 0L) return false;',
  '    long ms = countdown ? t - System.currentTimeMillis() : System.currentTimeMillis() - t;',
  '    return countdown ? (warnMs < 0 ? ms < 0 : ms <= warnMs) : warnMs >= 0 && ms >= warnMs;',
  '}', '',
];

/** An expression that renders field `jf` (owned by `owner`, e.g. "state" / "item") as display text */
function displayExpr(jf: JField, owner: string): string {
  const v = `${owner}.${jf.name}`;
  switch (jf.f.type) {
    case 'enum': return jf.f.options?.length ? `PluginState.labelOf(${jf.constPrefix}VALUES, ${jf.constPrefix}LABELS, ${v})` : `str(${v})`;
    case 'number': return `fmt(${v})`;
    case 'boolean': return `${v} ? "Yes" : "No"`;
    case 'datetime': return `time(${v})`;
    case 'point': return `point(${v})`;
    case 'list': return `${v}.size() + " items"`;
    default: return `str(${v})`;
  }
}

function condExpr(jf: JField, owner: string, op: string, value: unknown): string {
  const v = `${owner}.${jf.name}`;
  const t = jf.f.type;
  const truthy = t === 'boolean' ? v : t === 'number' ? `${v} != 0` : t === 'datetime' ? `${v} != 0L` : t === 'list' ? `!${v}.isEmpty()` : t === 'point' ? `${v} != null` : `${v} != null && !${v}.isEmpty()`;
  if (op === 'truthy') return truthy;
  if (op === 'falsy') return `!(${truthy})`;
  const lit = t === 'number' ? String(Number(value)) : t === 'boolean' ? String(value === true || value === 'true') : strLit(String(value));
  const eq = t === 'number' || t === 'boolean' ? `${v} == ${lit}` : `${lit}.equals(${v})`;
  return op === 'eq' ? eq : `!(${eq})`;
}

export function screenViewsJava(p: Project, m: JavaModel, plan: ScreenPlan, cls: string): string {
  const params = actionParams(p, m);
  const call = (actionId: string, item = 'null') => `actions.${javaIdent(camel(actionId))}(${params.get(actionId) ? item : ''})`;
  const top = (bind?: string) => (bind && !bind.startsWith('$') ? m.top.get(bind) : undefined);
  const out: string[] = [];
  const L = (s = '', ind = 1) => out.push(s ? J.repeat(ind) + s : '');

  out.push(`package ${m.pkg};`, '', '@@IMPORTS@@');
  out.push('/**', ` * Views for screen "${commentSafe(plan.screen.title)}" (#${plan.screen.id}), layout R.layout.${plan.layout}. ${HEADER_NOTE}`,
    ' * <pre>', ' *   View root = PluginLayoutInflater.inflate(pluginContext, R.layout.' + plan.layout + ', null);', ` *   ${cls} views = new ${cls}(root, state, actions);`,
    ' *   // after any state change made elsewhere: views.render();', ' * </pre>',
    ' * Input changes are written into state; events call Actions. render() pushes state into the views.', ' */',
    '@SuppressWarnings({"unused", "FieldCanBeLocal"})', `public final class ${cls} {`, '');
  L('public final View root;');
  L('private final PluginState state;');
  L('private final Actions actions;');
  L('/** true while render() writes into views, so listeners don\'t echo the write back */');
  L('private boolean rendering;');
  L();
  const fields = plan.views.filter((v) => v.role !== 'body' || v.tabIndex !== undefined);
  for (const v of fields) L(`public final ${v.javaType} ${javaIdent(v.field)};`);
  for (const l of plan.lists) L(`private final ${pascal(l.node.id)}Adapter ${camel(l.node.id)}Adapter = new ${pascal(l.node.id)}Adapter();`);
  // timers (here or in list rows) need a clock: one tick per screen re-renders every second.
  // View.post queues while the pane is detached, so the clock pauses when the pane is closed.
  const ticks = [...plan.views, ...plan.lists.flatMap((l) => l.rowViews)].some((v) => v.node.type === 'timer');
  if (ticks) {
    L('private static final int WARN = 0xFFE53935;');
    L('private final Runnable tick = new Runnable() {');
    L('@Override public void run() { render(); root.postDelayed(this, 1000); }', 2);
    L('};');
  }
  L();
  L(`public ${cls}(View root, PluginState state, Actions actions) {`);
  L('this.root = root;', 2);
  L('this.state = state;', 2);
  L('this.actions = actions;', 2);
  for (const v of fields) L(`${javaIdent(v.field)} = root.findViewById(R.id.${v.resId});`, 2);
  L('wire();', 2);
  if (ticks) L('root.post(tick);', 2);
  if (plan.views.some((v) => v.role === 'tab')) for (const t of new Set(plan.views.filter((v) => v.role === 'tab').map((v) => v.node.id))) L(`show${pascal(t)}Tab(0);`, 2);
  L('render();', 2);
  L('}');
  L();

  // ---- wire ----
  L('private void wire() {');
  for (const v of plan.views) wireView(v);
  for (const l of plan.lists) {
    const lv = javaIdent(l.view.field);
    L(`${lv}.setAdapter(${camel(l.node.id)}Adapter);`, 2);
    const empty = plan.views.find((x) => x.role === 'empty' && x.node.id === l.node.id);
    if (empty) L(`${lv}.setEmptyView(${javaIdent(empty.field)});`, 2);
    const ev = l.node.on?.itemClick ?? l.node.on?.rowClick;
    if (ev) L(`${lv}.setOnItemClickListener((parent, view, position, id) -> ${call(ev, `${camel(l.node.id)}Adapter.getItem(position)`)});`, 2);
  }
  L('}');
  L();

  function wireView(v: ViewRec) {
    const n = v.node;
    const f = javaIdent(v.field);
    const jf = top(n.bind);
    const change = n.on?.change;
    const fire = change ? ` ${call(change)};` : '';
    if (v.role === 'tab') { L(`${f}.setOnClickListener(x -> show${pascal(n.id)}Tab(${v.tabIndex}));`, 2); return; }
    if (v.role === 'header') {
      const body = plan.views.find((x) => x.role === 'body' && x.node.id === n.id && x.tabIndex === undefined);
      if (body) L(`${f}.setOnClickListener(x -> ${javaIdent(body.field)}.setVisibility(${javaIdent(body.field)}.getVisibility() == View.VISIBLE ? View.GONE : View.VISIBLE));`, 2);
      return;
    }
    if (v.role === 'action') {
      const ev = n.on?.click ?? n.on?.change ?? n.on?.send;
      if (ev) L(`${f}.setOnClickListener(x -> ${call(ev)});`, 2);
      else if (n.type === 'datetime' || n.type === 'color-picker' || n.type === 'contact-picker' || n.type === 'cot-type-picker') L(`// TODO #${n.id}: open the platform picker, write the result into state${n.bind ? `.${top(n.bind)?.name ?? n.bind}` : ''}, then render()`, 2);
      return;
    }
    if (v.role !== 'input') return;
    if (v.javaType === 'EditText') {
      let assign = '';
      if (jf?.f.type === 'string') assign = ` state.${jf.name} = s.toString();`;
      else if (jf?.f.type === 'number') assign = ` state.${jf.name} = PluginState.parseDouble(s.toString(), state.${jf.name});`;
      else if (jf?.f.type === 'point') assign = ` /* TODO #${n.id}: parse MGRS / lat,lon into state.${jf.name} */`;
      if (assign || fire) L(`${f}.addTextChangedListener(new AfterText() { @Override void changed(String s) {${assign}${fire} } });`, 2);
      return;
    }
    if (v.javaType === 'CheckBox' || v.javaType === 'Switch') {
      const assign = jf?.f.type === 'boolean' ? ` state.${jf.name} = checked;` : '';
      if (assign || fire) L(`${f}.setOnCheckedChangeListener((b, checked) -> { if (rendering) return;${assign}${fire} });`, 2);
      return;
    }
    if (v.javaType === 'Spinner') {
      const values = valuesExpr(n, jf);
      const assign = jf && values ? ` state.${jf.name} = ${values}[position];` : '';
      if (assign || fire) {
        L(`${f}.setOnItemSelectedListener(new AdapterView.OnItemSelectedListener() {`, 2);
        L(`@Override public void onItemSelected(AdapterView<?> parent, View view, int position, long id) { if (rendering) return;${assign}${fire} }`, 3);
        L('@Override public void onNothingSelected(AdapterView<?> parent) { }', 3);
        L('});', 2);
      }
      return;
    }
    if (v.javaType === 'RadioGroup') {
      const branches = (v.radios ?? []).map(([id, val]) => `if (checkedId == R.id.${id}) state.${jf?.name} = ${jf?.f.type === 'enum' ? `${jf.constPrefix}${upperSnake(val)}` : strLit(val)};`);
      L(`${f}.setOnCheckedChangeListener((g, checkedId) -> {`, 2);
      L('if (rendering) return;', 3);
      if (jf) branches.forEach((b, i) => L((i ? 'else ' : '') + b, 3));
      if (change) L(`${call(change)};`, 3);
      L('});', 2);
      return;
    }
    if (v.javaType === 'SeekBar') {
      const min = Number(n.props.min ?? 0);
      L(`${f}.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {`, 2);
      L(`@Override public void onProgressChanged(SeekBar s, int progress, boolean fromUser) { if (!fromUser) return;${jf?.f.type === 'number' ? ` state.${jf.name} = progress + ${min};` : ''}${fire} }`, 3);
      L('@Override public void onStartTrackingTouch(SeekBar s) { }', 3);
      L('@Override public void onStopTrackingTouch(SeekBar s) { }', 3);
      L('});', 2);
    }
  }

  function valuesExpr(n: Node, jf: JField | undefined): string | undefined {
    if (jf?.f.type === 'enum' && jf.f.options?.length) return `${jf.constPrefix}VALUES`;
    const opts = optionsOf(n, jf?.f);
    return opts.length ? `new String[] {${opts.map((o) => strLit(o.value)).join(', ')}}` : undefined;
  }

  // ---- render ----
  L('/** Push state into the views (values, show/hide rules, lists). */');
  L('public void render() {');
  L('rendering = true;', 2);
  L('try {', 2);
  for (const v of plan.views) renderView(v, 'state', 3, L);
  for (const l of plan.lists) L(`${camel(l.node.id)}Adapter.notifyDataSetChanged();`, 3), L(`fitHeight(${javaIdent(l.view.field)});`, 3);
  L('} finally {', 2);
  L('rendering = false;', 3);
  L('}', 2);
  L('}');
  L();

  function renderView(v: ViewRec, owner: 'state' | 'item', ind: number, emitLine: (s: string, i: number) => void, scope?: Map<string, JField>) {
    const n = v.node;
    const f = owner === 'item' ? javaIdent(v.field) : javaIdent(v.field);
    const resolve = (key: string | undefined): JField | undefined => {
      if (!key) return undefined;
      if (key.startsWith('$item.')) return owner === 'item' ? scope?.get(key.slice(6)) : undefined;
      return owner === 'state' ? m.top.get(key) : undefined;
    };
    if (v.role === 'wrap' && n.visibleWhen) {
      const jf = resolve(n.visibleWhen.key) ?? (owner === 'item' ? m.top.get(n.visibleWhen.key) : undefined);
      const who = n.visibleWhen.key.startsWith('$item.') ? owner : 'state';
      if (jf) emitLine(`${f}.setVisibility(${condExpr(jf, who, n.visibleWhen.op, n.visibleWhen.value)} ? View.VISIBLE : View.GONE);`, ind);
      return;
    }
    if (n.type === 'callsign' && !n.bind) { emitLine(`// TODO #${n.id}: show this device's callsign (ATAK: MapView.getMapView().getDeviceCallsign())`, ind); return; }
    const jf = resolve(n.bind);
    if (!jf) return;
    const val = `${owner}.${jf.name}`;
    if (v.role === 'main' || v.role === 'value') {
      if (n.type === 'status-badge' && jf.f.type === 'enum' && jf.f.options?.length) {
        emitLine(`${f}.setText(${displayExpr(jf, owner)});`, ind);
        emitLine(`tint(${f}, PluginState.colorOf(${jf.constPrefix}VALUES, ${jf.constPrefix}COLORS, ${val}));`, ind);
      } else if (n.type === 'timer' && jf.f.type === 'datetime') {
        const cd = n.props.mode === 'countdown';
        const warn = typeof n.props.warnMinutes === 'number' ? `${Math.round(n.props.warnMinutes * 60000)}L` : '-1L';
        emitLine(`${f}.setText(clock(${val}, ${cd}));`, ind);
        emitLine(`${f}.setTextColor(overdue(${val}, ${cd}, ${warn}) ? WARN : Color.WHITE);`, ind);
      } else if (n.type === 'stat' && typeof n.props.unit === 'string' && n.props.unit) emitLine(`${f}.setText(${displayExpr(jf, owner)} + ${strLit(` ${n.props.unit}`)});`, ind);
      else if (n.type === 'progress' && jf.f.type === 'number') emitLine(`${f}.setProgress((int) ${val});`, ind);
      else if (v.javaType === 'TextView' || v.javaType === 'EditText') emitLine(`${f}.setText(${n.type === 'map-point-picker' ? `${val} == null ? "Not set" : point(${val})` : displayExpr(jf, owner)});`, ind);
      return;
    }
    if (v.role !== 'input' || owner !== 'state') return;
    if (v.javaType === 'EditText' && (jf.f.type === 'string' || jf.f.type === 'number')) emitLine(`setTextIfChanged(${f}, ${jf.f.type === 'number' ? `fmt(${val})` : `str(${val})`});`, ind);
    else if ((v.javaType === 'CheckBox' || v.javaType === 'Switch') && jf.f.type === 'boolean') emitLine(`${f}.setChecked(${val});`, ind);
    else if (v.javaType === 'Spinner') { const ve = valuesExpr(n, jf); if (ve) emitLine(`${f}.setSelection(Math.max(0, PluginState.indexOf(${ve}, ${val})));`, ind); }
    else if (v.javaType === 'RadioGroup') (v.radios ?? []).forEach(([id, value], i) => emitLine(`${i ? 'else ' : ''}if (${jf.f.type === 'enum' ? `${jf.constPrefix}${upperSnake(value)}` : strLit(value)}.equals(${val})) ${f}.check(R.id.${id});`, ind));
    else if (v.javaType === 'SeekBar' && jf.f.type === 'number') emitLine(`${f}.setProgress((int) ${val} - ${Number(n.props.min ?? 0)});`, ind);
  }

  // ---- tabs ----
  for (const tabsId of new Set(plan.views.filter((v) => v.role === 'tab').map((v) => v.node.id))) {
    const pages = plan.views.filter((v) => v.role === 'body' && v.tabIndex !== undefined && plan.views.some((t) => t.role === 'tab' && t.node.id === tabsId && t.tabIndex === v.tabIndex))
      .filter((v) => isPageOf(p, tabsId, v.node.id));
    L(`private void show${pascal(tabsId)}Tab(int index) {`);
    pages.forEach((pg) => L(`${javaIdent(pg.field)}.setVisibility(index == ${pg.tabIndex} ? View.VISIBLE : View.GONE);`, 2));
    plan.views.filter((v) => v.role === 'tab' && v.node.id === tabsId).forEach((t) => L(`${javaIdent(t.field)}.setAlpha(index == ${t.tabIndex} ? 1f : 0.55f);`, 2));
    L('}');
    L();
  }

  // ---- adapters ----
  for (const l of plan.lists) adapter(l);
  function adapter(l: ListRec) {
    const jf = top(l.node.bind);
    const name = `${pascal(l.node.id)}Adapter`;
    const itemCls = jf?.itemClass ?? 'Object';
    const scope = jf ? m.items.get(jf.f) : undefined;
    L(`/** Rows of #${l.node.id}${jf ? ` (state.${jf.name})` : ''}. Row layout: R.layout.${l.rowLayout}. */`);
    L(`private final class ${name} extends BaseAdapter {`);
    if (!jf) {
      L(`// TODO #${l.node.id} is bound to "${l.node.bind ?? ''}", a list inside another list's row: build a nested adapter from the outer item`, 2);
      L('@Override public int getCount() { return 0; }', 2);
      L('@Override public Object getItem(int position) { return null; }', 2);
    } else {
      L(`@Override public int getCount() { return state.${jf.name}.size(); }`, 2);
      L(`@Override public ${itemCls} getItem(int position) { return state.${jf.name}.get(position); }`, 2);
    }
    L('@Override public long getItemId(int position) { return position; }', 2);
    L('@Override public View getView(int position, View row, ViewGroup parent) {', 2);
    L('// rows inflate from root\'s context, which PluginLayoutInflater set to the plugin\'s, so R.layout resolves', 3);
    L(`if (row == null) row = LayoutInflater.from(root.getContext()).inflate(R.layout.${l.rowLayout}, parent, false);`, 3);
    if (jf) {
      L(`final ${itemCls} item = getItem(position);`, 3);
      for (const rv of l.rowViews) {
        if (!['main', 'value', 'wrap', 'action'].includes(rv.role)) continue;
        const local = javaIdent(rv.field);
        L(`${rv.javaType} ${local} = row.findViewById(R.id.${rv.resId});`, 3);
        if (rv.role === 'action') {
          const ev = rv.node.on?.click ?? rv.node.on?.change ?? rv.node.on?.send;
          if (ev) L(`${local}.setOnClickListener(x -> ${call(ev, 'item')});`, 3);
          continue;
        }
        renderView(rv, 'item', 3, L, scope);
      }
    }
    L('return row;', 3);
    L('}', 2);
    L('}');
    L();
  }

  // ---- helpers ----
  out.push(`${J}/** ListViews inside a pane don't scroll on their own; size them to their rows. */`,
    `${J}private static void fitHeight(ListView list) {`,
    `${J}${J}ListAdapter a = list.getAdapter();`,
    `${J}${J}if (a == null) return;`,
    `${J}${J}int h = 0;`,
    `${J}${J}// before the first layout pass the width is 0: measure unconstrained rather than squashed`,
    `${J}${J}int wSpec = list.getWidth() > 0 ? View.MeasureSpec.makeMeasureSpec(list.getWidth(), View.MeasureSpec.AT_MOST) : View.MeasureSpec.UNSPECIFIED;`,
    `${J}${J}for (int i = 0; i < a.getCount(); i++) {`,
    `${J}${J}${J}View r = a.getView(i, null, list);`,
    `${J}${J}${J}r.measure(wSpec, View.MeasureSpec.UNSPECIFIED);`,
    `${J}${J}${J}h += r.getMeasuredHeight();`,
    `${J}${J}}`,
    `${J}${J}ViewGroup.LayoutParams lp = list.getLayoutParams();`,
    `${J}${J}lp.height = h + list.getDividerHeight() * Math.max(0, a.getCount() - 1);`,
    `${J}${J}list.setLayoutParams(lp);`,
    `${J}}`, '',
    `${J}private static void tint(TextView badge, String hex) {`,
    `${J}${J}if (hex != null && badge.getBackground() != null) badge.getBackground().mutate().setTint(Color.parseColor(hex));`,
    `${J}}`, '',
    `${J}private static void setTextIfChanged(TextView v, String s) {`,
    `${J}${J}if (!v.getText().toString().equals(s)) v.setText(s);`,
    `${J}}`, '',
    `${J}private static String str(Object o) { return o == null ? "" : String.valueOf(o); }`,
    `${J}private static String fmt(double d) { return d == Math.rint(d) ? String.valueOf((long) d) : String.valueOf(d); }`,
    `${J}private static String point(double[] p) { return p == null ? "" : String.format(Locale.US, "%.5f, %.5f", p[0], p[1]); }`,
    `${J}private static String time(long t) { return t == 0L ? "" : DateFormat.getDateTimeInstance(DateFormat.SHORT, DateFormat.SHORT).format(new Date(t)); }`, '',
    ...(ticks ? CLOCK_HELPERS.map((l) => (l ? J + l : l)) : []),
    `${J}/** TextWatcher that ignores render()'s own writes */`,
    `${J}private abstract class AfterText implements TextWatcher {`,
    `${J}${J}abstract void changed(String s);`,
    `${J}${J}@Override public void beforeTextChanged(CharSequence s, int a, int b, int c) { }`,
    `${J}${J}@Override public void onTextChanged(CharSequence s, int a, int b, int c) { }`,
    `${J}${J}@Override public void afterTextChanged(Editable s) { if (!rendering) changed(s.toString()); }`,
    `${J}}`, '}', '');
  // import only the classes this screen's code actually uses
  const code = out.join('\n');
  const body = code.replace('@@IMPORTS@@', '');
  const used = (cls: string) => new RegExp(`\\b${cls.split('.').pop()}\\b`).test(body);
  const imports = [...VIEW_IMPORTS, 'java.text.DateFormat', 'java.util.Date', 'java.util.Locale'].filter(used).map((i) => `import ${i};`);
  return code.replace('@@IMPORTS@@', [...imports, '', `import ${p.meta.packageId}.R;`, ''].join('\n'));
}

function isPageOf(p: Project, tabsId: string, pageId: string): boolean {
  for (const s of p.screens) for (const n of walk(s.root)) if (n.id === tabsId && n.kind === 'container') return n.children.some((c) => c.id === pageId);
  return false;
}

