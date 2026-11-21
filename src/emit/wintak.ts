// WinTAK emitter: Project → WPF UserControls (XAML + code-behind) and one MVVM view model.
// C# is kept to LangVersion 7.3 / .NET Framework 4.8 (what WinTAK plugins build with, see
// TAK-PluginSuite-FeatureLink/WinTAK5.6): no target-typed new, no nullable reference types,
// no records. The test suite builds this output with LangVersion=7.3.
//
// Bindings, not code-behind: every control binds to PluginViewModel (or a list item class);
// derived display values (option labels/colors, show-when booleans) are computed properties,
// refreshed by raising PropertyChanged("") on any change.

import { componentSpec } from '../spec/catalog';
import { hiddenOn, withOverrides } from '../spec/overrides';
import { walk } from '../spec/tree';
import type { ContainerNode, ElementNode, Node, Project, Screen, StateField } from '../spec/types';
import { commentSafe, csIdent, HEADER_NOTE, pascal, strLit, xmlEsc, type FileMap } from './common';

const I = '    ';
export const nsOf = (p: Project) => p.meta.packageId.split('.').map((s) => pascal(s)).join('.');
const prop = (key: string) => csIdent(pascal(key));
const itemClass = (key: string) => `${pascal(key)}Item`;
const visProp = (id: string) => `IsVisible_${pascal(id)}`;
const cmd = (actionId: string) => `${pascal(actionId)}Command`;

// ------------------------------------------------------------------ view model

function csType(f: StateField): string {
  switch (f.type) {
    case 'number': return 'double';
    case 'boolean': return 'bool';
    case 'datetime': return 'DateTime?';
    case 'list': return `ObservableCollection<${itemClass(f.key)}>`;
    default: return 'string'; // enum value, contact UID, point as "lat, lon" text
  }
}
function csDefault(f: StateField): string {
  const d = f.default;
  switch (f.type) {
    case 'number': return typeof d === 'number' ? `${d}d` : '0d';
    case 'boolean': return d === true ? 'true' : 'false';
    case 'datetime': return 'null';
    case 'list': return `new ObservableCollection<${itemClass(f.key)}>()`;
    case 'enum': return strLit(typeof d === 'string' && d ? d : f.options?.[0]?.value ?? '');
    default: return strLit(typeof d === 'string' ? d : '');
  }
}

interface VmInfo {
  /** show-when computed props per owner class: class name → [prop, expr] */
  vis: Map<string, [string, string][]>;
  /** radio option bools wanted: top-level enum keys */
  radios: Set<string>;
}

/** Owner class of a node: the VM, or the item class of the nearest list ancestor */
function ownerOf(p: Project, ancestors: Node[]): { cls: string; field?: StateField } {
  for (let i = ancestors.length - 1; i >= 0; i--) {
    const a = ancestors[i]!;
    if (a.kind === 'container' && a.type === 'list' && a.bind) {
      const outer = ownerOf(p, ancestors.slice(0, i));
      const f = a.bind.startsWith('$item.') ? outer.field?.itemFields?.find((x) => x.key === a.bind!.slice(6)) : p.state.find((x) => x.key === a.bind);
      if (f?.type === 'list') return { cls: itemClass(f.key), field: f };
    }
  }
  return { cls: 'PluginViewModel' };
}

function condCs(f: StateField, expr: string, op: string, value: unknown): string {
  const t = f.type;
  const truthy = t === 'boolean' ? expr : t === 'number' ? `${expr} != 0` : t === 'datetime' ? `${expr}.HasValue` : t === 'list' ? `${expr}.Count > 0` : `!string.IsNullOrEmpty(${expr})`;
  if (op === 'truthy') return truthy;
  if (op === 'falsy') return `!(${truthy})`;
  const lit = t === 'number' ? `${Number(value)}d` : t === 'boolean' ? String(value === true || value === 'true') : strLit(String(value));
  return `${expr} ${op === 'eq' ? '==' : '!='} ${lit}`;
}

function collectVm(p: Project): VmInfo {
  const info: VmInfo = { vis: new Map(), radios: new Set() };
  const all: { node: Node; ancestors: Node[] }[] = [];
  const go = (n: Node, anc: Node[]) => { all.push({ node: n, ancestors: anc }); if (n.kind === 'container') for (const c of n.children) go(c, [...anc, n]); };
  for (const s of p.screens) go(s.root, []);
  for (const { node, ancestors } of all) {
    const v = node.visibleWhen;
    if (v) {
      const own = ownerOf(p, ancestors);
      let f: StateField | undefined;
      let cls = 'PluginViewModel';
      if (v.key.startsWith('$item.')) { f = own.field?.itemFields?.find((x) => x.key === v.key.slice(6)); cls = own.cls; }
      else f = p.state.find((x) => x.key === v.key);
      if (f) info.vis.set(cls, [...(info.vis.get(cls) ?? []), [visProp(node.id), condCs(f, prop(f.key), v.op, v.value)]]);
    }
    if (node.type === 'radio-group' && node.bind && !node.bind.startsWith('$')) info.radios.add(node.bind);
  }
  return info;
}

function optionsList(f: StateField, ind: string): string {
  return `new List<Option>\n${ind}{\n${(f.options ?? []).map((o) => `${ind}${I}new Option(${strLit(o.value)}, ${strLit(o.label)}, ${o.color ? strLit(o.color) : 'null'}),`).join('\n')}\n${ind}}`;
}

function classBody(fields: StateField[], cls: string, info: VmInfo, out: string[], ind: string) {
  for (const f of fields) {
    const P = prop(f.key);
    const back = `_${f.key}`;
    if (f.type === 'enum' && f.options?.length) {
      out.push(`${ind}public static readonly IReadOnlyList<Option> ${P}OptionList = ${optionsList(f, ind)};`);
      out.push(`${ind}public IReadOnlyList<Option> ${P}Options { get { return ${P}OptionList; } }`);
      out.push(`${ind}public string ${P}Label { get { return Option.LabelOf(${P}OptionList, ${P}); } }`);
      out.push(`${ind}public string ${P}Color { get { return Option.ColorOf(${P}OptionList, ${P}); } }`);
    }
    const doc = [f.label, f.description, f.type === 'point' ? '"lat, lon" text; swap for a geo type in plugin code.' : '', f.type === 'contact' ? 'TAK contact UID.' : '', f.persisted ? 'Remembered across restarts.' : ''].filter(Boolean).join(' ');
    if (doc) out.push(`${ind}/// <summary>${xmlEsc(commentSafe(doc))}</summary>`);
    if (f.type === 'list') {
      out.push(`${ind}public ObservableCollection<${itemClass(f.key)}> ${P} { get; } = ${csDefault(f)};`);
      out.push(`${ind}public bool ${P}IsEmpty { get { return ${P}.Count == 0; } }`);
    } else {
      out.push(`${ind}private ${csType(f)} ${back} = ${csDefault(f)};`);
      out.push(`${ind}public ${csType(f)} ${P} { get { return ${back}; } set { Set(ref ${back}, value); } }`);
    }
    if (cls === 'PluginViewModel' && info.radios.has(f.key)) {
      for (const o of f.options ?? []) out.push(`${ind}public bool ${P}Is${pascal(o.value)} { get { return ${P} == ${strLit(o.value)}; } set { if (value) ${P} = ${strLit(o.value)}; } }`);
    }
    out.push('');
  }
  for (const [name, expr] of info.vis.get(cls) ?? []) out.push(`${ind}public bool ${name} { get { return ${expr}; } }`);
}

function listsIn(fields: StateField[]): StateField[] {
  return fields.flatMap((f) => (f.type === 'list' ? [f, ...listsIn(f.itemFields ?? [])] : []));
}

function viewModelCs(p: Project): string {
  const ns = nsOf(p);
  const info = collectVm(p);
  const out: string[] = [
    `// ${HEADER_NOTE}`,
    '// C# 7.3 / .NET Framework 4.8 compatible (WinTAK plugin toolchain).',
    'using System;', 'using System.Collections.Generic;', 'using System.Collections.ObjectModel;', 'using System.ComponentModel;',
    'using System.Linq;', 'using System.Runtime.CompilerServices;', 'using System.Windows.Input;', '',
    `namespace ${ns}.ViewModels`, '{',
    `${I}public sealed class Option`, `${I}{`,
    `${I}${I}public Option(string value, string label, string color) { Value = value; Label = label; Color = color; }`,
    `${I}${I}public string Value { get; private set; }`, `${I}${I}public string Label { get; private set; }`, `${I}${I}public string Color { get; private set; }`,
    `${I}${I}public static string LabelOf(IEnumerable<Option> options, string value) { var o = options.FirstOrDefault(x => x.Value == value); return o != null ? o.Label : value; }`,
    `${I}${I}public static string ColorOf(IEnumerable<Option> options, string value) { var o = options.FirstOrDefault(x => x.Value == value); return o != null && o.Color != null ? o.Color : "#6B7280"; }`,
    `${I}}`, '',
    `${I}public abstract class ObservableObject : INotifyPropertyChanged`, `${I}{`,
    `${I}${I}public event PropertyChangedEventHandler PropertyChanged;`,
    `${I}${I}protected void Raise(string name) { var h = PropertyChanged; if (h != null) h(this, new PropertyChangedEventArgs(name)); }`,
    `${I}${I}/// <summary>Set + notify. Also raises "" so computed labels, colors and show-when flags refresh.</summary>`,
    `${I}${I}protected void Set<T>(ref T field, T value, [CallerMemberName] string name = "")`,
    `${I}${I}{`, `${I}${I}${I}if (EqualityComparer<T>.Default.Equals(field, value)) return;`, `${I}${I}${I}field = value;`, `${I}${I}${I}Raise(name);`, `${I}${I}${I}Raise(string.Empty);`, `${I}${I}}`,
    `${I}}`, '',
    `${I}public sealed class RelayCommand : ICommand`, `${I}{`,
    `${I}${I}private readonly Action<object> _run;`,
    `${I}${I}public RelayCommand(Action<object> run) { _run = run; }`,
    `${I}${I}public event EventHandler CanExecuteChanged { add { } remove { } }`,
    `${I}${I}public bool CanExecute(object parameter) { return true; }`,
    `${I}${I}public void Execute(object parameter) { _run(parameter); }`,
    `${I}}`, '',
  ];
  for (const lf of listsIn(p.state)) {
    out.push(`${I}/// <summary>One record of ${lf.key}.</summary>`, `${I}public sealed class ${itemClass(lf.key)} : ObservableObject`, `${I}{`);
    classBody(lf.itemFields ?? [], itemClass(lf.key), info, out, I + I);
    out.push(`${I}}`, '');
  }
  // which actions receive a list item
  const itemArg = new Map<string, string>();
  for (const s of p.screens) for (const n of walk(s.root)) {
    const a = n.on?.itemClick ?? n.on?.rowClick;
    if (a && n.bind && !n.bind.startsWith('$')) itemArg.set(a, itemClass(n.bind));
  }
  out.push(`${I}/// <summary>The plugin's state and actions. Set as DataContext of every view.</summary>`, `${I}public sealed class PluginViewModel : ObservableObject`, `${I}{`);
  classBody(p.state, 'PluginViewModel', info, out, I + I);
  out.push('', ...p.actions.map((a) => `${I}${I}public ICommand ${cmd(a.id)} { get; private set; }`), '');
  out.push(`${I}${I}public PluginViewModel()`, `${I}${I}{`);
  for (const a of p.actions) {
    const t = itemArg.get(a.id);
    out.push(`${I}${I}${I}${cmd(a.id)} = new RelayCommand(p => ${pascal(a.id)}(${t ? `p as ${t}` : ''}));`);
  }
  for (const lf of p.state.filter((f) => f.type === 'list')) out.push(`${I}${I}${I}${prop(lf.key)}.CollectionChanged += (s, e) => Raise(string.Empty);`);
  out.push(`${I}${I}}`, '');
  for (const a of p.actions) {
    const t = itemArg.get(a.id);
    out.push(`${I}${I}/// <summary>${xmlEsc(commentSafe(`${a.label} [${a.kind}]. ${a.intent || 'TODO: no description; ask the designer.'}`))}</summary>`,
      `${I}${I}private void ${pascal(a.id)}(${t ? `${t} item` : ''})`, `${I}${I}{`, `${I}${I}${I}// TODO: implement as described above`, `${I}${I}}`, '');
  }
  out.push(`${I}}`, '}', '');
  return out.join('\n');
}

// ------------------------------------------------------------------ XAML

interface XCtx {
  p: Project;
  /** list item scopes, innermost last */
  scopes: StateField[];
}

const BOOL_VIS = 'Converter={StaticResource BoolToVis}';
/** A binding to a top-level VM property, reaching out of any DataTemplate it's inside */
function vmBinding(ctx: XCtx, path: string, extra = ''): string {
  return ctx.scopes.length
    ? `{Binding DataContext.${path}, RelativeSource={RelativeSource AncestorType=UserControl}${extra ? `, ${extra}` : ''}}`
    : `{Binding ${path}${extra ? `, ${extra}` : ''}}`;
}
function bindPath(ctx: XCtx, bind: string | undefined): { binding: (suffix?: string, extra?: string) => string; field: StateField } | undefined {
  if (!bind) return undefined;
  if (bind.startsWith('$item.')) {
    const f = ctx.scopes[ctx.scopes.length - 1]?.itemFields?.find((x) => x.key === bind.slice(6));
    return f ? { field: f, binding: (s = '', extra = '') => `{Binding ${prop(f.key)}${s}${extra ? `, ${extra}` : ''}}` } : undefined;
  }
  const f = ctx.p.state.find((x) => x.key === bind);
  return f ? { field: f, binding: (s = '', extra = '') => vmBinding(ctx, prop(f.key) + s, extra) } : undefined;
}
const command = (ctx: XCtx, actionId: string | undefined, param = false) =>
  actionId ? ` Command="${vmBinding(ctx, cmd(actionId))}"${param ? ' CommandParameter="{Binding}"' : ''}` : '';
const a = (s: unknown) => xmlEsc(String(s ?? ''));

function margin(dir: 'v' | 'h', first: boolean, gap: number) {
  if (first || !gap) return '';
  return dir === 'v' ? ` Margin="0,${gap},0,0"` : ` Margin="${gap},0,0,0"`;
}

function xNode(ctx: XCtx, raw: Node, ind: string, dir: 'v' | 'h', first: boolean, gap: number): string[] {
  const n = withOverrides(raw, 'wintak');
  if (hiddenOn(n, 'wintak')) return [`${ind}<!-- #${n.id} is hidden on WinTAK -->`];
  let vis = '';
  if (n.visibleWhen) {
    const inItem = n.visibleWhen.key.startsWith('$item.');
    vis = ` Visibility="${inItem ? `{Binding ${visProp(n.id)}, ${BOOL_VIS}}` : vmBinding(ctx, visProp(n.id), BOOL_VIS)}"`;
  }
  const common = `${margin(dir, first, gap)}${vis}`;
  return n.kind === 'container' ? xContainer(ctx, n, ind, common) : xElement(ctx, n, ind, common, dir);
}

function xKids(ctx: XCtx, c: ContainerNode, ind: string, dir: 'v' | 'h'): string[] {
  const gap = typeof c.props.gap === 'number' ? c.props.gap : 8;
  return c.children.flatMap((ch, i) => xNode(ctx, ch, ind, dir, i === 0, gap));
}

function xContainer(ctx: XCtx, c: ContainerNode, ind: string, common: string): string[] {
  const i2 = ind + I;
  switch (c.type) {
    case 'stack': return [`${ind}<StackPanel${common}>`, ...xKids(ctx, c, i2, 'v'), `${ind}</StackPanel>`];
    case 'row': {
      const tag = c.props.wrap ? 'WrapPanel' : 'StackPanel';
      const va = ({ start: 'Top', center: 'Center', end: 'Bottom', stretch: 'Stretch' } as Record<string, string>)[String(c.props.align ?? 'center')];
      return [`${ind}<${tag} Orientation="Horizontal"${common}>`, `${i2}<!-- align children: ${va} -->`, ...xKids(ctx, c, i2, 'h'), `${ind}</${tag}>`];
    }
    case 'section': return [`${ind}<GroupBox Header="${a(c.props.title)}" Padding="6"${common}>`, `${i2}<StackPanel>`, ...xKids(ctx, c, i2 + I, 'v'), `${i2}</StackPanel>`, `${ind}</GroupBox>`];
    case 'collapsible': return [`${ind}<Expander Header="${a(c.props.title)}" IsExpanded="${c.props.startOpen === false ? 'False' : 'True'}"${common}>`, `${i2}<StackPanel Margin="6">`, ...xKids(ctx, c, i2 + I, 'v'), `${i2}</StackPanel>`, `${ind}</Expander>`];
    case 'scroll': return [`${ind}<ScrollViewer VerticalScrollBarVisibility="Auto"${common}>`, `${i2}<StackPanel>`, ...xKids(ctx, c, i2 + I, 'v'), `${i2}</StackPanel>`, `${ind}</ScrollViewer>`];
    case 'tabs':
      return [`${ind}<TabControl${common}>`, ...c.children.flatMap((t) => [`${i2}<TabItem Header="${a(t.props.title)}">`, ...xNode(ctx, { ...t, props: { ...t.props, title: '' } } as Node, i2 + I, 'v', true, 0), `${i2}</TabItem>`]), `${ind}</TabControl>`];
    case 'list': {
      const b = bindPath(ctx, c.bind);
      if (!b || b.field.type !== 'list') return [`${ind}<!-- TODO #${c.id}: not bound to a list -->`];
      const click = c.on?.itemClick;
      ctx.scopes.push(b.field);
      const row = xKids(ctx, c, i2 + I + I + I + (click ? I : ''), 'v');
      ctx.scopes.pop();
      // inside a DataTemplate the row's DataContext is the item: reach the VM through the UserControl
      const rowCmd = click ? ` Command="{Binding DataContext.${cmd(click)}, RelativeSource={RelativeSource AncestorType=UserControl}}" CommandParameter="{Binding}"` : '';
      return [
        `${ind}<StackPanel${common}>`,
        `${i2}<ItemsControl ItemsSource="${b.binding()}">`,
        `${i2}${I}<ItemsControl.ItemTemplate>`, `${i2}${I}${I}<DataTemplate>`,
        ...(click ? [`${i2}${I}${I}${I}<Button HorizontalContentAlignment="Stretch" Background="Transparent" BorderThickness="0,0,0,1" Padding="6"${rowCmd}>`, `${i2}${I}${I}${I}${I}<StackPanel>`]
          : [`${i2}${I}${I}${I}<StackPanel Margin="0,4">`]),
        ...row,
        ...(click ? [`${i2}${I}${I}${I}${I}</StackPanel>`, `${i2}${I}${I}${I}</Button>`] : [`${i2}${I}${I}${I}</StackPanel>`]),
        `${i2}${I}${I}</DataTemplate>`, `${i2}${I}</ItemsControl.ItemTemplate>`,
        `${i2}</ItemsControl>`,
        `${i2}<TextBlock Text="${a(c.props.emptyText ?? 'Nothing here yet')}" FontStyle="Italic" Opacity="0.7" Visibility="${b.binding('IsEmpty', BOOL_VIS)}" />`,
        `${ind}</StackPanel>`,
      ];
    }
  }
}

function labelled(n: ElementNode, ind: string, common: string, inner: (i: string) => string[]): string[] {
  const label = typeof n.props.label === 'string' && n.props.label ? n.props.label : undefined;
  if (!label || ['checkbox', 'toggle'].includes(n.type)) {
    // spacing + show-when go on the first real element (not a leading comment)
    const lines = inner(ind);
    const at = lines.findIndex((l) => /^\s*<[A-Za-z]/.test(l));
    if (at >= 0) lines[at] = lines[at]!.replace(/^(\s*<[A-Za-z.]+)/, `$1${common}`);
    return lines;
  }
  return [`${ind}<StackPanel${common}>`, `${ind}${I}<TextBlock Text="${a(label)}" Opacity="0.75" Margin="0,0,0,2" />`, ...inner(ind + I), `${ind}</StackPanel>`];
}

function xElement(ctx: XCtx, n: ElementNode, ind: string, common: string, dir: 'v' | 'h'): string[] {
  const p = n.props;
  const b = bindPath(ctx, n.bind);
  const twoWay = (s = '') => (b ? b.binding(s, 'UpdateSourceTrigger=PropertyChanged') : '');
  const spec = componentSpec('element', n.type);
  const approx = spec?.support.wintak === 'approx' ? [`${ind}<!-- ${commentSafe(`${spec.label}: approximated with stock WPF controls; refine to match the mockup.`)} -->`] : [];
  const one = (s: string) => labelled(n, ind, common, (i) => [`${i}${s}`]);
  const halign = p.fullWidth || dir === 'v' && !['button', 'icon-button', 'status-badge', 'callsign', 'open-on-map', 'map-item-ref'].includes(n.type) ? '' : ' HorizontalAlignment="Left"';
  let out: string[];
  switch (n.type) {
    case 'heading': out = one(`<TextBlock Text="${a(p.text)}" FontSize="${({ '1': 20, '2': 16, '3': 13 } as Record<string, number>)[String(p.level ?? '2')] ?? 16}" FontWeight="Bold" />`); break;
    case 'label': out = one(`<TextBlock Text="${b ? b.binding(b.field.type === 'enum' && b.field.options?.length ? 'Label' : '') : a(p.text)}" TextWrapping="Wrap"${p.muted ? ' Opacity="0.7"' : ''} />`); break;
    case 'button': {
      const style = String(p.style ?? 'primary');
      const colors = style === 'danger' ? ' Background="#C62828" Foreground="White"' : style === 'primary' ? ' Background="#007ACC" Foreground="White"' : style === 'subtle' ? ' Background="Transparent" BorderThickness="0"' : '';
      out = one(`<Button Content="${a(p.text)}" Padding="12,4"${halign}${colors}${command(ctx, n.on?.click, ctx.scopes.length > 0)} />`);
      break;
    }
    case 'icon-button': out = one(`<Button Content="◆" ToolTip="${a(p.tooltip)}" Width="32" Height="32"${halign}${command(ctx, n.on?.click, ctx.scopes.length > 0)} /><!-- TODO icon: ${commentSafe(String(p.icon))} -->`); break;
    case 'text-input': case 'coordinate-field':
      out = labelled(n, ind, common, (i) => [...(p.placeholder ? [`${i}<!-- placeholder: ${commentSafe(String(p.placeholder))} -->`] : []), `${i}<TextBox Text="${twoWay()}"${p.readOnly ? ' IsReadOnly="True"' : ''}${n.type === 'coordinate-field' ? ' FontFamily="Consolas"' : ''} />`]);
      break;
    case 'number-input': out = labelled(n, ind, common, (i) => [`${i}<TextBox Text="${twoWay()}" />`]); break;
    case 'text-area': out = labelled(n, ind, common, (i) => [`${i}<TextBox Text="${twoWay()}" AcceptsReturn="True" TextWrapping="Wrap" MinLines="${Number(p.rows ?? 3)}" VerticalScrollBarVisibility="Auto" />`]); break;
    case 'dropdown':
      out = labelled(n, ind, common, (i) => (b?.field.type === 'enum' && b.field.options?.length
        ? [`${i}<ComboBox ItemsSource="${b.binding('Options')}" DisplayMemberPath="Label" SelectedValuePath="Value" SelectedValue="${b.binding()}" />`]
        : [`${i}<ComboBox${b ? ` SelectedValue="${b.binding()}" SelectedValuePath="Content"` : ''}>`, ...(Array.isArray(p.options) ? (p.options as string[]) : []).map((o) => `${i}${I}<ComboBoxItem Content="${a(o)}" />`), `${i}</ComboBox>`]));
      break;
    case 'checkbox': case 'toggle': out = one(`<CheckBox Content="${a(p.label)}"${b?.field.type === 'boolean' ? ` IsChecked="${b.binding()}"` : ''} />${n.type === 'toggle' ? '<!-- toggle: WPF has no stock switch; restyle the CheckBox if needed -->' : ''}`); break;
    case 'radio-group': {
      const opts = b?.field.options ?? [];
      const top = b && !n.bind!.startsWith('$');
      out = labelled(n, ind, common, (i) => [`${i}<StackPanel Orientation="${p.horizontal ? 'Horizontal' : 'Vertical'}">`,
        ...opts.map((o) => `${i}${I}<RadioButton GroupName="${a(n.id)}" Content="${a(o.label)}" Margin="0,0,12,2"${top ? ` IsChecked="${b!.binding(`Is${pascal(o.value)}`)}"` : ''} />`),
        ...(top ? [] : [`${i}${I}<!-- TODO #${n.id}: bind the selected option -->`]),
        `${i}</StackPanel>`]);
      break;
    }
    case 'slider': out = labelled(n, ind, common, (i) => [`${i}<Slider Minimum="${Number(p.min ?? 0)}" Maximum="${Number(p.max ?? 100)}" TickFrequency="${Number(p.step ?? 1)}" IsSnapToTickEnabled="True"${b?.field.type === 'number' ? ` Value="${b.binding()}"` : ''} />`]); break;
    case 'datetime': out = labelled(n, ind, common, (i) => [`${i}<DatePicker${b?.field.type === 'datetime' ? ` SelectedDate="${b.binding()}"` : ''} />${p.mode !== 'date' ? '<!-- time part: add a time input; DatePicker is date-only -->' : ''}`]); break;
    case 'color-picker': out = labelled(n, ind, common, (i) => [`${i}<TextBox Text="${twoWay()}" /><!-- color: WPF has no stock picker -->`]); break;
    case 'image': out = one(`<Border Height="${Number(p.height ?? 96)}" BorderBrush="#555" BorderThickness="1"><TextBlock Text="${a(p.alt)}" HorizontalAlignment="Center" VerticalAlignment="Center" Opacity="0.6" /></Border><!-- TODO image: ${commentSafe(String(p.hint ?? p.alt))} -->`); break;
    case 'divider': out = one('<Separator />'); break;
    case 'progress': out = labelled(n, ind, common, (i) => [`${i}<ProgressBar Height="8" Maximum="${Number(p.max ?? 100)}"${b?.field.type === 'number' ? ` Value="${b.binding()}"` : ' IsIndeterminate="True"'} />`]); break;
    case 'status-badge':
      out = b?.field.type === 'enum' && b.field.options?.length
        ? one(`<Border CornerRadius="10" Padding="8,2" HorizontalAlignment="Left" Background="${b.binding('Color')}"><TextBlock Text="${b.binding('Label')}" Foreground="White" FontWeight="Bold"${p.size === 'large' ? ' FontSize="16"' : ''} /></Border>`)
        : one('<Border CornerRadius="10" Padding="8,2" HorizontalAlignment="Left" Background="#6B7280"><TextBlock Text="Status" Foreground="White" /></Border>');
      break;
    case 'empty-state': out = one(`<TextBlock Text="${a(p.text)}" FontStyle="Italic" Opacity="0.7" HorizontalAlignment="Center" Padding="0,12" />`); break;
    case 'table': {
      const cols = Array.isArray(p.columns) ? (p.columns as string[]) : [];
      const lf = b?.field.type === 'list' ? b.field : undefined;
      const row = n.on?.rowClick;
      out = !lf ? [`${ind}<!-- TODO #${n.id}: table isn't bound to a list -->`] : labelled(n, ind, common, (i) => [
        `${i}<DataGrid ItemsSource="${b!.binding()}" AutoGenerateColumns="False" IsReadOnly="True" HeadersVisibility="Column" CanUserAddRows="False">`,
        `${i}${I}<DataGrid.Columns>`,
        ...cols.map((c) => {
          const f = lf.itemFields?.find((x) => x.key === c);
          return `${i}${I}${I}<DataGridTextColumn Header="${a(c)}" Binding="{Binding ${prop(c)}${f?.type === 'enum' && f.options?.length ? 'Label' : ''}}" Width="*" />`;
        }),
        ...(row ? [`${i}${I}${I}<DataGridTemplateColumn Width="Auto">`, `${i}${I}${I}${I}<DataGridTemplateColumn.CellTemplate>`, `${i}${I}${I}${I}${I}<DataTemplate>`,
          `${i}${I}${I}${I}${I}${I}<Button Content="Open" Padding="6,0" Command="{Binding DataContext.${cmd(row)}, RelativeSource={RelativeSource AncestorType=UserControl}}" CommandParameter="{Binding}" />`,
          `${i}${I}${I}${I}${I}</DataTemplate>`, `${i}${I}${I}${I}</DataGridTemplateColumn.CellTemplate>`, `${i}${I}${I}</DataGridTemplateColumn>`] : []),
        `${i}${I}</DataGrid.Columns>`, `${i}</DataGrid>`,
      ]);
      break;
    }
    case 'map-point-picker': case 'data-package-attach':
      out = labelled(n, ind, common, (i) => [`${i}<DockPanel>`,
        `${i}${I}<Button DockPanel.Dock="Right" Content="${a(n.type === 'map-point-picker' ? p.buttonText ?? 'Pick on map' : 'Attach…')}" Padding="8,2" Margin="6,0,0,0"${command(ctx, n.on?.change)} />`,
        `${i}${I}<TextBlock VerticalAlignment="Center" Text="${b ? b.binding() : a(n.type === 'map-point-picker' ? 'Not set' : 'No file')}" />`,
        `${i}</DockPanel>`]);
      break;
    case 'contact-picker': case 'cot-type-picker':
      out = labelled(n, ind, common, (i) => [`${i}<!-- TODO #${n.id}: populate from WinTAK ${n.type === 'contact-picker' ? 'contacts' : 'CoT types'} -->`, `${i}<ComboBox IsEditable="True"${b && b.field.type !== 'list' ? ` Text="${b.binding()}"` : ''} />`]);
      break;
    case 'callsign': out = one(b ? `<TextBlock FontWeight="Bold" Text="${b.binding()}" />` : '<TextBlock FontWeight="Bold" Text="Callsign" /><!-- TODO: this device\'s callsign -->'); break;
    case 'map-item-ref': out = one(`<Button Content="${a(p.label || 'Map item')}" Padding="8,2"${halign}${command(ctx, n.on?.click)} />`); break;
    case 'open-on-map': out = one(`<Button Content="${a(p.text ?? 'Show on map')}" Padding="8,2"${halign} /><!-- TODO: pan the map to ${n.bind ?? 'the location'} -->`); break;
    case 'chat-send':
      out = one(`<DockPanel><Button DockPanel.Dock="Right" Content="Send" Padding="8,2" Margin="6,0,0,0"${command(ctx, n.on?.send)} /><TextBox /></DockPanel>`);
      break;
    default: out = [`${ind}<!-- TODO unknown component ${a(n.type)} (#${n.id}) -->`];
  }
  return [...approx, ...out];
}

function viewXaml(p: Project, s: Screen, cls: string): string {
  const ns = nsOf(p);
  const ctx: XCtx = { p, scopes: [] };
  return [
    `<UserControl x:Class="${ns}.Views.${cls}"`,
    `${I}${I}${I}xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"`,
    `${I}${I}${I}xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml">`,
    `${I}<!-- ${commentSafe(`Screen "${s.title}" (#${s.id}). ${HEADER_NOTE} DataContext = PluginViewModel.`)} -->`,
    `${I}<UserControl.Resources>`, `${I}${I}<BooleanToVisibilityConverter x:Key="BoolToVis" />`, `${I}</UserControl.Resources>`,
    `${I}<ScrollViewer VerticalScrollBarVisibility="Auto">`,
    `${I}${I}<StackPanel Margin="8">`,
    ...xNode(ctx, s.root, I + I + I, 'v', true, 0),
    `${I}${I}</StackPanel>`, `${I}</ScrollViewer>`, '</UserControl>', '',
  ].join('\n');
}

export function emitWintak(p: Project): FileMap {
  const ns = nsOf(p);
  const files: FileMap = { 'ViewModels/PluginViewModel.cs': viewModelCs(p) };
  const lines: string[] = [];
  for (const s of p.screens) {
    const cls = `${pascal(s.id)}View`;
    files[`Views/${cls}.xaml`] = viewXaml(p, s, cls);
    files[`Views/${cls}.xaml.cs`] = [`// ${HEADER_NOTE}`, 'using System.Windows.Controls;', '', `namespace ${ns}.Views`, '{',
      `${I}public partial class ${cls} : UserControl`, `${I}{`, `${I}${I}public ${cls}() { InitializeComponent(); }`, `${I}}`, '}', ''].join('\n');
    lines.push(`- **${s.title}** (${s.surface}) → \`Views/${cls}.xaml\`${p.entry.openScreen === s.id ? ' (shown by the ribbon button)' : ''}`);
  }
  files['SCAFFOLD.md'] = [
    `# WinTAK scaffold: ${p.meta.name}`, '', HEADER_NOTE, '',
    `Copy \`Views/\` and \`ViewModels/\` into the WinTAK plugin project (namespace \`${ns}\`; rename to match). Then:`, '',
    '1. Host the launch screen\'s view in the plugin\'s dock pane; set every view\'s `DataContext` to one shared `PluginViewModel`.',
    `2. Wire the ribbon button "${p.entry.label}" to show the dock pane.`,
    '3. Implement the private action methods at the bottom of `PluginViewModel`: each `<summary>` is the designer\'s description.',
    '4. Remembered fields: load/save them with the plugin\'s settings mechanism.',
    '5. Old-style (non-SDK) .csproj files must list each new .xaml/.cs explicitly (Page / Compile items).', '',
    '## Screens', '', ...lines, '',
    '## Verified', '', 'The builder\'s tests build this output as a WPF library with LangVersion 7.3 and check that every `{Binding}` path exists.', '',
  ].join('\n');
  return files;
}
