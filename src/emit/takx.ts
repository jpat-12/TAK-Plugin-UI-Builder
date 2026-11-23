// TAKX emitter: Project → Java 17 / Swing, following the TAKX 5.8.0 SDK curriculum's app
// plugin (RavenAppPlugin): an @AppPlugin extending AAppPlugin mounts JPanels through
// delegate.getUISpaceManager() using a ComponentDescriptor, with UI work on the EDT
// (@InvokeOnEDT). Verified against the SDK Javadoc (deployment-5.8.0-javadoc.jar), not guessed:
// @AppPlugin(spec, descriptor) [canRunHeadless is deprecated for removal: not emitted],
// @PluginSpecification(family, type, version, iconPath) all required, ComponentPosition
// LEFT|RIGHT|BOTTOM|CENTER|GLOBE, builder setComponentPosition/setToolbarButtonVisible/setTooltipText.
//
// Data + actions reuse the ATAK Java model: PluginState (desktop flavor: java.util.prefs) and Actions.
// Panels register one Runnable per live binding; render() replays them, lists rebuild their rows.

import { componentSpec } from '../spec/catalog';
import { hiddenOn, withOverrides } from '../spec/overrides';
import type { ContainerNode, ElementNode, Node, Project, Screen, StateField } from '../spec/types';
import { actionParams, actionsJava, buildModel, CLOCK_HELPERS, pluginStateJava, type JavaModel, type JField } from './atak/java';
import { camel, commentSafe, HEADER_NOTE, javaIdent, pascal, strLit, upperSnake, type FileMap } from './common';
import { ALERT_COLORS, gridColumns, optionsOf } from './atak/layout';

const J = '    ';

interface Scope { v: string; field: StateField }
interface SCtx {
  p: Project;
  m: JavaModel;
  params: Map<string, string | null>;
  scopes: Scope[];
  /** constructor (or row-builder) statements */
  body: string[];
  /** row builder methods */
  methods: string[];
  used: Set<string>;
  /** a timer is on this screen: the panel needs a 1-second clock */
  clock: boolean;
}

// ------------------------------------------------------------------ expressions

function resolve(ctx: SCtx, bind: string | undefined): { jf: JField; expr: string } | undefined {
  if (!bind) return undefined;
  if (bind.startsWith('$item.')) {
    const sc = ctx.scopes[ctx.scopes.length - 1];
    const jf = sc ? ctx.m.items.get(sc.field)?.get(bind.slice(6)) : undefined;
    return sc && jf ? { jf, expr: `${sc.v}.${jf.name}` } : undefined;
  }
  const jf = ctx.m.top.get(bind);
  return jf ? { jf, expr: `state.${jf.name}` } : undefined;
}

function display(r: { jf: JField; expr: string }): string {
  const { jf, expr } = r;
  switch (jf.f.type) {
    case 'enum': return jf.f.options?.length ? `PluginState.labelOf(${jf.constPrefix}VALUES, ${jf.constPrefix}LABELS, ${expr})` : `str(${expr})`;
    case 'number': return `fmt(${expr})`;
    case 'boolean': return `(${expr} ? "Yes" : "No")`;
    case 'datetime': return `time(${expr})`;
    case 'point': return `point(${expr})`;
    case 'list': return `(${expr}.size() + " items")`;
    default: return `str(${expr})`;
  }
}

function cond(ctx: SCtx, n: Node): string | undefined {
  const w = n.visibleWhen;
  if (!w) return undefined;
  const r = resolve(ctx, w.key);
  if (!r) return undefined;
  const t = r.jf.f.type;
  const v = r.expr;
  const truthy = t === 'boolean' ? v : t === 'number' ? `${v} != 0` : t === 'datetime' ? `${v} != 0L` : t === 'list' ? `!${v}.isEmpty()` : t === 'point' ? `${v} != null` : `${v} != null && !${v}.isEmpty()`;
  if (w.op === 'truthy') return truthy;
  if (w.op === 'falsy') return `!(${truthy})`;
  const lit = t === 'number' ? String(Number(w.value)) : t === 'boolean' ? String(w.value === true || w.value === 'true') : strLit(String(w.value));
  const eq = t === 'number' || t === 'boolean' ? `${v} == ${lit}` : `${lit}.equals(${v})`;
  return w.op === 'eq' ? eq : `!(${eq})`;
}

const inRow = (ctx: SCtx) => ctx.scopes.length > 0;
/** A statement that must run on render(): registered at top level, run once while building a row */
function live(ctx: SCtx, stmt: string) {
  ctx.body.push(inRow(ctx) ? stmt : `renderers.add(() -> { ${stmt} });`);
}
function call(ctx: SCtx, actionId: string | undefined): string | undefined {
  if (!actionId) return undefined;
  const takesItem = ctx.params.get(actionId);
  const arg = takesItem ? (ctx.scopes.length ? ctx.scopes[ctx.scopes.length - 1]!.v : 'null') : '';
  return `actions.${javaIdent(camel(actionId))}(${arg})`;
}

// ------------------------------------------------------------------ nodes

function gen(ctx: SCtx, raw: Node, parent: string, vertical: boolean, gap: number, first: boolean) {
  const n = withOverrides(raw, 'takx');
  if (hiddenOn(n, 'takx')) { ctx.body.push(`// #${n.id} is hidden on TAKX`); return; }
  const v = n.kind === 'container' ? container(ctx, n) : element(ctx, n, vertical);
  if (!v) return;
  ctx.body.push(`addTo(${parent}, ${v}, ${vertical}, ${first ? 0 : gap});`);
  const c = cond(ctx, n);
  if (c) live(ctx, `${v}.setVisible(${c});`);
}

function kids(ctx: SCtx, c: ContainerNode, parent: string, vertical: boolean) {
  const gap = typeof c.props.gap === 'number' ? c.props.gap : 8;
  c.children.forEach((ch, i) => gen(ctx, ch, parent, vertical, gap, i === 0));
}

function container(ctx: SCtx, c: ContainerNode): string {
  const v = javaIdent(camel(c.id));
  const B = (...s: string[]) => ctx.body.push(...s);
  switch (c.type) {
    case 'stack': B(`final JPanel ${v} = box(BoxLayout.Y_AXIS);`); kids(ctx, c, v, true); break;
    case 'row':
      if (c.props.wrap) B(`final JPanel ${v} = new JPanel(new FlowLayout(FlowLayout.LEFT, 0, 0));`, `${v}.setOpaque(false);`);
      else B(`final JPanel ${v} = box(BoxLayout.X_AXIS);`);
      kids(ctx, c, v, false);
      break;
    case 'grid': {
      const gap = typeof c.props.gap === 'number' ? c.props.gap : 8;
      B(`final JPanel ${v} = new JPanel(new GridLayout(0, ${gridColumns(c)}, ${gap}, ${gap}));`, `${v}.setOpaque(false);`);
      // GridLayout spaces cells itself: add every child with no strut (a strut would take a cell)
      c.children.forEach((ch) => gen(ctx, ch, v, true, 0, true));
      break;
    }
    case 'section':
      B(`final JPanel ${v} = box(BoxLayout.Y_AXIS);`,
        c.props.title ? `${v}.setBorder(BorderFactory.createTitledBorder(${strLit(String(c.props.title))}));` : `${v}.setBorder(BorderFactory.createEtchedBorder());`);
      kids(ctx, c, v, true);
      break;
    case 'collapsible':
      B(`final JPanel ${v} = box(BoxLayout.Y_AXIS);`,
        `final JPanel ${v}Body = box(BoxLayout.Y_AXIS);`,
        `final JToggleButton ${v}Header = new JToggleButton(${strLit(String(c.props.title ?? ''))}, ${c.props.startOpen !== false});`,
        `${v}Body.setVisible(${c.props.startOpen !== false});`,
        `${v}Header.addActionListener(e -> { ${v}Body.setVisible(${v}Header.isSelected()); ${v}.revalidate(); });`,
        `addTo(${v}, ${v}Header, true, 0);`, `addTo(${v}, ${v}Body, true, 4);`);
      kids(ctx, c, `${v}Body`, true);
      break;
    case 'scroll':
      B(`final JPanel ${v}Inner = box(BoxLayout.Y_AXIS);`);
      kids(ctx, c, `${v}Inner`, true);
      B(`final JScrollPane ${v} = new JScrollPane(${v}Inner);`, `${v}.setPreferredSize(new Dimension(${v}.getPreferredSize().width, 320));`);
      break;
    case 'tabs':
      B(`final JTabbedPane ${v} = new JTabbedPane();`);
      for (const t of c.children) {
        const page = withOverrides(t, 'takx');
        if (hiddenOn(page, 'takx')) continue;
        const holder = `${v}Tab${pascal(t.id)}`;
        B(`final JPanel ${holder} = box(BoxLayout.Y_AXIS);`);
        gen(ctx, { ...page, props: { ...page.props, title: '' } } as Node, holder, true, 0, true); // the tab label carries the title
        B(`${v}.addTab(${strLit(String(page.props.title ?? 'Tab'))}, ${holder});`);
      }
      break;
    case 'list': return list(ctx, c);
  }
  return v;
}

function list(ctx: SCtx, c: ContainerNode): string {
  const v = javaIdent(camel(c.id));
  const r = resolve(ctx, c.bind);
  if (!r || r.jf.f.type !== 'list') { ctx.body.push(`// TODO #${c.id}: not bound to a list`); return ''; }
  const depth = ctx.scopes.length + 1;
  const iv = depth === 1 ? 'item' : `item${depth}`;
  const fn = `row${pascal(c.id)}`;
  const itemType = r.jf.itemClass!;
  ctx.body.push(`final JPanel ${v} = box(BoxLayout.Y_AXIS);`);

  // the row builder: its own statement buffer and scope
  const saved = ctx.body;
  ctx.body = [];
  ctx.scopes.push({ v: iv, field: r.jf.f });
  const click = call(ctx, c.on?.itemClick);
  kids(ctx, c, 'row', true);
  ctx.scopes.pop();
  const rowBody = ctx.body;
  ctx.body = saved;
  ctx.methods.push(
    `${J}/** One row of #${c.id}. */`,
    `${J}private JComponent ${fn}(final ${itemType} ${iv}) {`,
    `${J}${J}final JPanel row = box(BoxLayout.Y_AXIS);`,
    `${J}${J}row.setBorder(BorderFactory.createCompoundBorder(BorderFactory.createMatteBorder(0, 0, 1, 0, Color.GRAY), BorderFactory.createEmptyBorder(4, 2, 4, 2)));`,
    ...(click ? [`${J}${J}row.setCursor(Cursor.getPredefinedCursor(Cursor.HAND_CURSOR));`, `${J}${J}row.addMouseListener(new MouseAdapter() { @Override public void mouseClicked(MouseEvent e) { ${click}; } });`] : []),
    ...rowBody.map((l) => `${J}${J}${l}`),
    `${J}${J}return row;`, `${J}}`, '');
  live(ctx, `${v}.removeAll(); for (${itemType} it : ${r.expr}) ${v}.add(${fn}(it)); if (${r.expr}.isEmpty()) ${v}.add(muted(${strLit(String(c.props.emptyText ?? 'Nothing here yet'))})); ${v}.revalidate(); ${v}.repaint();`);
  return v;
}

function element(ctx: SCtx, n: ElementNode, vertical: boolean): string {
  const p = n.props;
  const v = javaIdent(camel(n.id));
  const r = resolve(ctx, n.bind);
  const B = (...s: string[]) => ctx.body.push(...s);
  const top = r && !inRow(ctx) ? r : undefined; // two-way binding only for top-level fields
  const change = call(ctx, n.on?.change);
  const fire = change ? ` ${change};` : '';
  const label = typeof p.label === 'string' && p.label && !['checkbox', 'toggle'].includes(n.type) ? p.label : undefined;
  const spec = componentSpec('element', n.type);
  if (spec?.support.takx === 'approx') B(`// ${commentSafe(`${spec.label}: approximated with stock Swing; refine to match the mockup.`)}`);
  /** wrap with a label when the design gives one; returns the outer component */
  const wrap = (inner: string) => {
    if (!label) return inner;
    B(`final JComponent ${v}Field = labelled(${strLit(label)}, ${inner});`);
    return `${v}Field`;
  };
  const sizeFor = (full: boolean) => (full || vertical ? 'wide' : 'tight');

  switch (n.type) {
    case 'heading': {
      const size = ({ '1': 20, '2': 16, '3': 13 } as Record<string, number>)[String(p.level ?? '2')] ?? 16;
      B(`final JLabel ${v} = new JLabel(${strLit(String(p.text ?? ''))});`, `${v}.setFont(${v}.getFont().deriveFont(Font.BOLD, ${size}f));`);
      return v;
    }
    case 'label':
      B(`final JLabel ${v} = new JLabel(${strLit(r ? '' : String(p.text ?? ''))});`);
      if (p.muted) B(`${v}.setForeground(Color.GRAY);`);
      if (r) live(ctx, `${v}.setText(${display(r)});`);
      return v;
    case 'button': case 'icon-button': case 'map-item-ref': case 'open-on-map': {
      const text = n.type === 'button' ? String(p.text ?? '') : n.type === 'icon-button' ? '◆' : n.type === 'open-on-map' ? String(p.text ?? 'Show on map') : String(p.label || 'Map item');
      B(`final JButton ${v} = ${sizeFor(p.fullWidth === true)}(new JButton(${strLit(text)}));`);
      if (n.type === 'icon-button') B(`${v}.setToolTipText(${strLit(String(p.tooltip ?? ''))}); // TODO icon: ${commentSafe(String(p.icon ?? ''))}`);
      if (p.style === 'danger') B(`${v}.setForeground(new Color(0xC62828));`);
      if (p.style === 'subtle') B(`${v}.setContentAreaFilled(false);`, `${v}.setBorderPainted(false);`);
      const click = call(ctx, n.on?.click);
      if (click) B(`${v}.addActionListener(e -> ${click});`);
      if (n.type === 'open-on-map') B(`// TODO #${n.id}: delegate.getGlobeManager().getLastFocusedGlobe().goTo(<location of ${r ? r.expr : 'the item'}>) (pattern from the SDK's RavenAppPanel)`);
      return v;
    }
    case 'text-input': case 'coordinate-field': {
      B(`final JTextField ${v} = wide(new JTextField(20));`);
      if (p.placeholder) B(`${v}.setToolTipText(${strLit(String(p.placeholder))}); // Swing has no placeholder text`);
      if (n.type === 'coordinate-field') B(`${v}.setFont(new Font(Font.MONOSPACED, Font.PLAIN, ${v}.getFont().getSize()));`);
      if (p.readOnly) B(`${v}.setEditable(false);`);
      if (r?.jf.f.type === 'point') live(ctx, `${v}.setText(${display(r)});`);
      else if (top && top.jf.f.type === 'string') {
        B(`onText(${v}, () -> { if (rendering) return; ${top.expr} = ${v}.getText();${fire} });`);
        live(ctx, `setTextIfChanged(${v}, str(${top.expr}));`);
      } else if (r) live(ctx, `${v}.setText(${display(r)});`);
      return wrap(v);
    }
    case 'number-input': {
      const min = typeof p.min === 'number' ? `Double.valueOf(${p.min})` : 'null';
      const max = typeof p.max === 'number' ? `Double.valueOf(${p.max})` : 'null';
      B(`final JSpinner ${v} = wide(new JSpinner(new SpinnerNumberModel(Double.valueOf(${typeof p.min === 'number' ? p.min : 0}), ${min}, ${max}, Double.valueOf(1))));`);
      if (top?.jf.f.type === 'number') {
        B(`${v}.addChangeListener(e -> { if (rendering) return; ${top.expr} = ((Number) ${v}.getValue()).doubleValue();${fire} });`);
        live(ctx, `${v}.setValue(Double.valueOf(${top.expr}));`);
      }
      return wrap(v);
    }
    case 'text-area': {
      B(`final JTextArea ${v} = new JTextArea(${Number(p.rows ?? 3)}, 20);`, `${v}.setLineWrap(true);`, `${v}.setWrapStyleWord(true);`, `final JScrollPane ${v}Scroll = wide(new JScrollPane(${v}));`);
      if (top?.jf.f.type === 'string') {
        B(`onText(${v}, () -> { if (rendering) return; ${top.expr} = ${v}.getText();${fire} });`);
        live(ctx, `setTextIfChanged(${v}, str(${top.expr}));`);
      }
      return wrap(`${v}Scroll`);
    }
    case 'dropdown': {
      const enumTop = top?.jf.f.type === 'enum' && top.jf.f.options?.length ? top : undefined;
      const opts = optionsOf(n, r?.jf.f);
      B(`final JComboBox<String> ${v} = wide(new JComboBox<>(${enumTop ? `${enumTop.jf.constPrefix}LABELS` : `new String[] {${opts.map((o) => strLit(o.label)).join(', ')}}`}));`);
      if (enumTop) {
        B(`${v}.addActionListener(e -> { if (rendering || ${v}.getSelectedIndex() < 0) return; ${enumTop.expr} = ${enumTop.jf.constPrefix}VALUES[${v}.getSelectedIndex()];${fire} });`);
        live(ctx, `${v}.setSelectedIndex(Math.max(0, PluginState.indexOf(${enumTop.jf.constPrefix}VALUES, ${enumTop.expr})));`);
      } else if (top?.jf.f.type === 'string') {
        B(`${v}.addActionListener(e -> { if (rendering) return; ${top.expr} = (String) ${v}.getSelectedItem();${fire} });`);
        live(ctx, `${v}.setSelectedItem(${top.expr});`);
      }
      return wrap(v);
    }
    case 'checkbox': case 'toggle':
      B(`final JCheckBox ${v} = new JCheckBox(${strLit(String(p.label ?? ''))});${n.type === 'toggle' ? ' // Swing has no switch; a checkbox stands in' : ''}`);
      if (top?.jf.f.type === 'boolean') {
        B(`${v}.addActionListener(e -> { if (rendering) return; ${top.expr} = ${v}.isSelected();${fire} });`);
        live(ctx, `${v}.setSelected(${top.expr});`);
      }
      return v;
    case 'radio-group': {
      const opts = optionsOf(n, r?.jf.f);
      const enumTop = top?.jf.f.type === 'enum' ? top : undefined;
      B(`final JPanel ${v} = box(BoxLayout.${p.horizontal ? 'X' : 'Y'}_AXIS);`, `final ButtonGroup ${v}Group = new ButtonGroup();`);
      opts.forEach((o, i) => {
        const rb = `${v}${i}`;
        const value = enumTop ? `${enumTop.jf.constPrefix}${upperSnake(o.value)}` : strLit(o.value);
        B(`final JRadioButton ${rb} = new JRadioButton(${strLit(o.label)});`, `${v}Group.add(${rb});`, `${v}.add(${rb});`);
        if (top) {
          B(`${rb}.addActionListener(e -> { if (rendering) return; ${top.expr} = ${value};${fire} });`);
          live(ctx, `${rb}.setSelected(${value}.equals(${top.expr}));`);
        }
      });
      return wrap(v);
    }
    case 'slider': {
      const min = Number(p.min ?? 0);
      const max = Number(p.max ?? 100);
      B(`final JSlider ${v} = wide(new JSlider(${min}, ${max}, ${min}));`);
      if (top?.jf.f.type === 'number') {
        B(`${v}.addChangeListener(e -> { if (rendering) return; ${top.expr} = ${v}.getValue();${fire} });`);
        live(ctx, `${v}.setValue((int) ${top.expr});`);
      }
      return wrap(v);
    }
    case 'datetime': {
      const pattern = p.mode === 'date' ? 'yyyy-MM-dd' : p.mode === 'time' ? 'HH:mm' : 'yyyy-MM-dd HH:mm';
      B(`final JSpinner ${v} = wide(new JSpinner(new SpinnerDateModel()));`, `${v}.setEditor(new JSpinner.DateEditor(${v}, ${strLit(pattern)}));`);
      if (top?.jf.f.type === 'datetime') {
        B(`${v}.addChangeListener(e -> { if (rendering) return; ${top.expr} = ((Date) ${v}.getValue()).getTime();${fire} });`);
        live(ctx, `if (${top.expr} != 0L) ${v}.setValue(new Date(${top.expr}));`);
      }
      return wrap(v);
    }
    case 'color-picker': {
      B(`final JButton ${v} = tight(new JButton("Pick color…"));`);
      const assign = top?.jf.f.type === 'string' ? ` ${top.expr} = String.format("#%06X", picked.getRGB() & 0xFFFFFF);` : '';
      B(`${v}.addActionListener(e -> { Color picked = JColorChooser.showDialog(${v}, ${strLit(label ?? 'Color')}, null); if (picked == null) return;${assign}${fire} render(); });`);
      return wrap(v);
    }
    case 'image':
      B(`final JLabel ${v} = wide(new JLabel(${strLit(String(p.alt ?? ''))}, SwingConstants.CENTER)); // TODO image: ${commentSafe(String(p.hint ?? p.alt ?? ''))}`,
        `${v}.setPreferredSize(new Dimension(200, ${Number(p.height ?? 96)}));`, `${v}.setBorder(BorderFactory.createDashedBorder(Color.GRAY));`);
      return v;
    case 'divider': B(`final JSeparator ${v} = wide(new JSeparator());`); return v;
    case 'progress':
      B(`final JProgressBar ${v} = wide(new JProgressBar(0, ${Number(p.max ?? 100)}));`);
      if (r?.jf.f.type === 'number') live(ctx, `${v}.setValue((int) ${r.expr});`);
      else B(`${v}.setIndeterminate(true);`);
      return wrap(v);
    case 'status-badge':
      B(`final JLabel ${v} = tight(badge());`);
      if (r?.jf.f.type === 'enum' && r.jf.f.options?.length) {
        live(ctx, `${v}.setText(${display(r)}); ${v}.setBackground(color(PluginState.colorOf(${r.jf.constPrefix}VALUES, ${r.jf.constPrefix}COLORS, ${r.expr})));`);
      } else B(`${v}.setText("Status");`);
      return v;
    case 'empty-state': B(`final JLabel ${v} = muted(${strLit(String(p.text ?? ''))});`); return v;
    case 'alert': {
      const c = ALERT_COLORS[String(p.tone ?? 'info')] ?? ALERT_COLORS.info!;
      B(`final JLabel ${v} = wide(new JLabel(${strLit(r ? '' : String(p.text ?? ''))}));`, `${v}.setOpaque(true);`,
        `${v}.setBackground(new Color(0x${c.bg.slice(1)}));`, `${v}.setForeground(new Color(0x${c.fg.slice(1)}));`, `${v}.setBorder(BorderFactory.createEmptyBorder(8, 10, 8, 10));`);
      if (r) live(ctx, `${v}.setText(${display(r)});`);
      return v;
    }
    case 'stat': {
      B(`final JPanel ${v} = box(BoxLayout.Y_AXIS);`, `${v}.setBorder(BorderFactory.createCompoundBorder(BorderFactory.createEtchedBorder(), BorderFactory.createEmptyBorder(6, 8, 6, 8)));`,
        `final JLabel ${v}Value = new JLabel("—");`, `${v}Value.setFont(${v}Value.getFont().deriveFont(Font.BOLD, 24f));`, `${v}Value.setAlignmentX(Component.CENTER_ALIGNMENT);`,
        `final JLabel ${v}Caption = new JLabel(${strLit(String(p.caption ?? ''))});`, `${v}Caption.setForeground(Color.GRAY);`, `${v}Caption.setAlignmentX(Component.CENTER_ALIGNMENT);`,
        `${v}.add(${v}Value);`, `${v}.add(${v}Caption);`);
      if (r) live(ctx, `${v}Value.setText(${display(r)}${typeof p.unit === 'string' && p.unit ? ` + ${strLit(` ${p.unit}`)}` : ''});`);
      return v;
    }
    case 'timer': {
      B(`final JLabel ${v} = new JLabel("--:--");`, `${v}.setFont(new Font(Font.MONOSPACED, Font.BOLD, 22));`, `final Color ${v}Normal = ${v}.getForeground();`);
      if (r?.jf.f.type === 'datetime') {
        const cd = p.mode === 'countdown';
        const warn = typeof p.warnMinutes === 'number' ? `${Math.round(p.warnMinutes * 60000)}L` : '-1L';
        ctx.clock = true;
        live(ctx, `${v}.setText(clock(${r.expr}, ${cd})); ${v}.setForeground(overdue(${r.expr}, ${cd}, ${warn}) ? WARN : ${v}Normal);`);
      }
      return wrap(v);
    }
    case 'loading':
      B(`final JProgressBar ${v}Bar = tight(new JProgressBar());`, `${v}Bar.setIndeterminate(true);`, `final JPanel ${v} = box(BoxLayout.X_AXIS);`,
        `addTo(${v}, ${v}Bar, false, 0);`, `addTo(${v}, muted(${strLit(String(p.text ?? 'Loading…'))}), false, 8);`);
      return v;
    case 'callsign':
      B(`final JLabel ${v} = new JLabel(${r ? '""' : '"Callsign"'});`, `${v}.setFont(${v}.getFont().deriveFont(Font.BOLD));`);
      if (r) live(ctx, `${v}.setText(${display(r)});`);
      else B(`// TODO #${n.id}: show this device's callsign`);
      return v;
    case 'table': {
      const cols = Array.isArray(p.columns) ? (p.columns as string[]) : [];
      if (!r || r.jf.f.type !== 'list' || inRow(ctx)) { B(`// TODO #${n.id}: table isn't bound to a top-level list`); return ''; }
      const items = ctx.m.items.get(r.jf.f)!;
      const cell = (c: string) => {
        const jf = items.get(c);
        return jf ? display({ jf, expr: `it.${jf.name}` }) : '""';
      };
      B(`final DefaultTableModel ${v}Model = new DefaultTableModel(new Object[] {${cols.map(strLit).join(', ')}}, 0) { @Override public boolean isCellEditable(int row, int col) { return false; } };`,
        `final JTable ${v}Table = new JTable(${v}Model);`, `final JScrollPane ${v} = wide(new JScrollPane(${v}Table));`,
        `${v}.setPreferredSize(new Dimension(300, 160));`);
      const rowClick = n.on?.rowClick;
      if (rowClick) {
        const takes = ctx.params.get(rowClick);
        B(`${v}Table.getSelectionModel().addListSelectionListener(e -> { int i = ${v}Table.getSelectedRow(); if (rendering || e.getValueIsAdjusting() || i < 0) return; actions.${javaIdent(camel(rowClick))}(${takes ? `${r.expr}.get(i)` : ''}); });`);
      }
      live(ctx, `${v}Model.setRowCount(0); for (${r.jf.itemClass} it : ${r.expr}) ${v}Model.addRow(new Object[] {${cols.map(cell).join(', ')}});`);
      return v;
    }
    case 'map-point-picker': case 'data-package-attach': {
      const isMap = n.type === 'map-point-picker';
      B(`final JLabel ${v}Value = new JLabel(${strLit(isMap ? 'Not set' : 'No file')});`, `final JButton ${v}Button = new JButton(${strLit(isMap ? String(p.buttonText ?? 'Pick on map') : 'Attach…')});`,
        `final JPanel ${v} = box(BoxLayout.X_AXIS);`, `addTo(${v}, ${v}Value, false, 0);`, `${v}.add(Box.createHorizontalGlue());`, `addTo(${v}, ${v}Button, false, 6);`);
      if (isMap) {
        if (r) live(ctx, `${v}Value.setText(${r.jf.f.type === 'point' ? `${r.expr} == null ? "Not set" : point(${r.expr})` : display(r)});`);
        if (change) B(`${v}Button.addActionListener(e -> ${change});`);
        else B(`// TODO #${n.id}: let the user click the globe, store the location, then render()`);
      } else {
        const assign = top?.jf.f.type === 'string' ? ` ${top.expr} = chooser.getSelectedFile().getPath(); ${v}Value.setText(chooser.getSelectedFile().getName());` : ` ${v}Value.setText(chooser.getSelectedFile().getName());`;
        B(`${v}Button.addActionListener(e -> { JFileChooser chooser = new JFileChooser(); if (chooser.showOpenDialog(${v}) != JFileChooser.APPROVE_OPTION) return;${assign}${fire} });`);
      }
      return wrap(v);
    }
    case 'contact-picker': case 'cot-type-picker':
      B(`final JComboBox<String> ${v} = wide(new JComboBox<>()); // TODO #${n.id}: fill from TAKX ${n.type === 'contact-picker' ? 'contacts' : 'CoT types'}`, `${v}.setEditable(true);`);
      if (top && top.jf.f.type !== 'list' && top.jf.f.type !== 'point') B(`${v}.addActionListener(e -> { if (rendering) return; ${top.expr} = (String) ${v}.getSelectedItem();${fire} });`);
      return wrap(v);
    case 'chat-send': {
      const send = call(ctx, n.on?.send);
      B(`final JTextField ${v}Input = new JTextField(20);`, `final JButton ${v}Send = new JButton("Send");`,
        `final JPanel ${v} = box(BoxLayout.X_AXIS);`, `addTo(${v}, ${v}Input, false, 0);`, `addTo(${v}, ${v}Send, false, 6);`);
      if (send) B(`${v}Send.addActionListener(e -> ${send});`);
      return v;
    }
    default:
      B(`// TODO unknown component ${n.type} (#${n.id})`);
      return '';
  }
}

// ------------------------------------------------------------------ files

const IMPORTS = [
  'javax.swing.BorderFactory', 'javax.swing.Box', 'javax.swing.BoxLayout', 'javax.swing.ButtonGroup', 'javax.swing.JButton', 'javax.swing.JCheckBox',
  'javax.swing.JColorChooser', 'javax.swing.JComboBox', 'javax.swing.JComponent', 'javax.swing.JFileChooser', 'javax.swing.JLabel', 'javax.swing.JPanel',
  'javax.swing.JProgressBar', 'javax.swing.JRadioButton', 'javax.swing.JScrollPane', 'javax.swing.JSeparator', 'javax.swing.JSlider', 'javax.swing.JSpinner',
  'javax.swing.JTabbedPane', 'javax.swing.JTable', 'javax.swing.JTextArea', 'javax.swing.JTextField', 'javax.swing.JToggleButton', 'javax.swing.SpinnerDateModel',
  'javax.swing.SpinnerNumberModel', 'javax.swing.SwingConstants', 'javax.swing.event.DocumentEvent', 'javax.swing.event.DocumentListener',
  'javax.swing.table.DefaultTableModel', 'javax.swing.text.JTextComponent', 'java.awt.BorderLayout', 'java.awt.Color', 'java.awt.Component', 'java.awt.Cursor',
  'java.awt.Dimension', 'java.awt.FlowLayout', 'java.awt.Font', 'java.awt.GridLayout', 'java.awt.event.MouseAdapter', 'java.awt.event.MouseEvent', 'java.text.DateFormat',
  'java.util.ArrayList', 'java.util.Date', 'java.util.List', 'java.util.Locale',
];

function panelJava(p: Project, m: JavaModel, s: Screen, cls: string): string {
  const ctx: SCtx = { p, m, params: actionParams(p, m), scopes: [], body: [], methods: [], used: new Set(), clock: false };
  gen(ctx, { ...s.root, visibleWhen: undefined } as Node, 'content', true, 0, true);
  const out: string[] = [
    `package ${m.pkg};`, '', '@@IMPORTS@@',
    '/**',
    ` * Screen "${commentSafe(s.title)}" (#${s.id}) as a Swing panel for TAKX. ${HEADER_NOTE}`,
    ' * Inputs write into state, events call Actions, render() pushes state back into the panel.',
    ' * Mount it with the UISpaceManager (see the generated *Plugin class); call render() after changing state elsewhere.',
    ' */',
    '@SuppressWarnings({"unused", "serial"})',
    `public final class ${cls} extends JPanel {`, '',
    `${J}private final PluginState state;`,
    `${J}private final Actions actions;`,
    `${J}/** one entry per live binding (values, show/hide rules, lists); render() runs them all */`,
    `${J}private final List<Runnable> renderers = new ArrayList<>();`,
    `${J}/** true while render() writes into components, so listeners don't echo the write back */`,
    `${J}private boolean rendering;`, '',
    `${J}public ${cls}(PluginState state, Actions actions) {`,
    `${J}${J}super(new BorderLayout());`,
    `${J}${J}this.state = state;`,
    `${J}${J}this.actions = actions;`,
    `${J}${J}final JPanel content = box(BoxLayout.Y_AXIS);`,
    `${J}${J}content.setBorder(BorderFactory.createEmptyBorder(8, 8, 8, 8));`,
    ...ctx.body.map((l) => `${J}${J}${l}`),
    `${J}${J}// NORTH keeps components at their preferred height instead of stretching to fill the dock`,
    `${J}${J}final JPanel north = new JPanel(new BorderLayout());`,
    `${J}${J}north.add(content, BorderLayout.NORTH);`,
    `${J}${J}add(new JScrollPane(north), BorderLayout.CENTER);`,
    `${J}${J}render();`,
    // javax.swing.Timer fires on the EDT, so render() stays on the Swing thread
    ...(ctx.clock ? [`${J}${J}// timers: re-render once a second (runs on the EDT). Stop it if the panel is ever disposed.`, `${J}${J}new javax.swing.Timer(1000, e -> render()).start();`] : []),
    `${J}}`, '',
    `${J}/** Push state into the panel. Call on the EDT. */`,
    `${J}public void render() {`,
    `${J}${J}rendering = true;`,
    `${J}${J}try { for (Runnable r : renderers) r.run(); } finally { rendering = false; }`,
    `${J}}`, '',
    ...ctx.methods,
    `${J}// ---- helpers ----`,
    `${J}private static JPanel box(int axis) { JPanel p = new JPanel(); p.setLayout(new BoxLayout(p, axis)); p.setOpaque(false); return p; }`,
    `${J}/** add with spacing; vertical boxes left-align children (BoxLayout needs one shared alignment) */`,
    `${J}private static void addTo(JComponent parent, JComponent child, boolean vertical, int gap) {`,
    `${J}${J}if (gap > 0) parent.add(vertical ? Box.createVerticalStrut(gap) : Box.createHorizontalStrut(gap));`,
    `${J}${J}if (vertical) child.setAlignmentX(Component.LEFT_ALIGNMENT); else child.setAlignmentY(Component.CENTER_ALIGNMENT);`,
    `${J}${J}parent.add(child);`,
    `${J}}`,
    `${J}/** fill the width but keep the natural height (BoxLayout would otherwise stretch it) */`,
    `${J}private static <T extends JComponent> T wide(T c) { c.setMaximumSize(new Dimension(Integer.MAX_VALUE, c.getPreferredSize().height)); return c; }`,
    `${J}private static <T extends JComponent> T tight(T c) { c.setMaximumSize(c.getPreferredSize()); return c; }`,
    `${J}private static JComponent labelled(String label, JComponent input) {`,
    `${J}${J}JPanel p = box(BoxLayout.Y_AXIS);`,
    `${J}${J}JLabel l = new JLabel(label);`,
    `${J}${J}l.setForeground(Color.GRAY);`,
    `${J}${J}addTo(p, l, true, 0);`,
    `${J}${J}addTo(p, input, true, 2);`,
    `${J}${J}return p;`,
    `${J}}`,
    `${J}private static JLabel muted(String text) { JLabel l = new JLabel(text); l.setForeground(Color.GRAY); l.setFont(l.getFont().deriveFont(Font.ITALIC)); return l; }`,
    `${J}private static JLabel badge() { JLabel l = new JLabel(); l.setOpaque(true); l.setForeground(Color.WHITE); l.setFont(l.getFont().deriveFont(Font.BOLD)); l.setBorder(BorderFactory.createEmptyBorder(2, 8, 2, 8)); return l; }`,
    `${J}private static Color color(String hex) { return hex == null ? Color.GRAY : Color.decode(hex); }`,
    `${J}private static void onText(JTextComponent c, Runnable r) {`,
    `${J}${J}c.getDocument().addDocumentListener(new DocumentListener() {`,
    `${J}${J}${J}@Override public void insertUpdate(DocumentEvent e) { r.run(); }`,
    `${J}${J}${J}@Override public void removeUpdate(DocumentEvent e) { r.run(); }`,
    `${J}${J}${J}@Override public void changedUpdate(DocumentEvent e) { r.run(); }`,
    `${J}${J}});`,
    `${J}}`,
    `${J}private static void setTextIfChanged(JTextComponent c, String s) { if (!c.getText().equals(s)) c.setText(s); }`,
    `${J}private static String str(Object o) { return o == null ? "" : String.valueOf(o); }`,
    `${J}private static String fmt(double d) { return d == Math.rint(d) ? String.valueOf((long) d) : String.valueOf(d); }`,
    `${J}private static String point(double[] p) { return p == null ? "" : String.format(Locale.US, "%.5f, %.5f", p[0], p[1]); }`,
    `${J}private static String time(long t) { return t == 0L ? "" : DateFormat.getDateTimeInstance(DateFormat.SHORT, DateFormat.SHORT).format(new Date(t)); }`,
    ...(ctx.clock ? [`${J}private static final Color WARN = new Color(0xE53935);`, ...CLOCK_HELPERS.map((l) => (l ? J + l : l))] : []),
    '}', '',
  ];
  const code = out.join('\n');
  const body = code.replace('@@IMPORTS@@', '');
  const imports = IMPORTS.filter((i) => new RegExp(`\\b${i.split('.').pop()}\\b`).test(body)).map((i) => `import ${i};`);
  return code.replace('@@IMPORTS@@', imports.join('\n') + '\n');
}

function defaultActionsJava(p: Project, m: JavaModel): string {
  const params = actionParams(p, m);
  return [
    `package ${m.pkg};`, '', 'import java.util.logging.Logger;', '',
    `/** Starting point for Actions: every method logs a TODO. ${HEADER_NOTE} Replace each body with the described behavior. */`,
    'public class DefaultActions implements Actions {', '',
    `${J}private static final Logger LOG = Logger.getLogger(DefaultActions.class.getName());`,
    `${J}protected final PluginState state;`, '',
    `${J}public DefaultActions(PluginState state) { this.state = state; }`, '',
    ...p.actions.flatMap((a) => {
      const t = params.get(a.id);
      return [`${J}/** ${commentSafe(a.intent || a.label)} */`, `${J}@Override`, `${J}public void ${javaIdent(camel(a.id))}(${t ? `${t} item` : ''}) {`,
        `${J}${J}LOG.warning(${strLit(`TODO ${a.id}: ${a.label}`)});`, `${J}}`, ''];
    }),
    '}', '',
  ].join('\n');
}

function pluginJava(p: Project, m: JavaModel, panels: Map<string, string>): string {
  const cls = `${pascal(p.meta.name || 'Plugin')}Plugin`;
  const entry = p.screens.find((s) => s.id === p.entry.openScreen) ?? p.screens[0]!;
  const entryPanel = panels.get(entry.id)!;
  const others = p.screens.filter((s) => s.id !== entry.id);
  const icon = `${p.meta.packageId.split('.').pop()}.png`;
  return [
    `package ${p.meta.packageId};`, '',
    'import gov.takx.api.annotation.InvokeOnEDT;',
    'import gov.takx.api.plugin.annotations.AppPlugin;',
    'import gov.takx.api.plugin.annotations.PluginDescriptor;',
    'import gov.takx.api.plugin.annotations.PluginSpecification;',
    'import gov.takx.api.plugin.app.AAppPlugin;',
    'import gov.takx.api.ui.ComponentPosition;',
    'import gov.takx.api.ui.IUISpaceManager;',
    'import gov.takx.platform.ui.ComponentDescriptor;',
    'import gov.takx.platform.ui.ComponentDescriptorBuilder;',
    `import ${m.pkg}.Actions;`, `import ${m.pkg}.DefaultActions;`, `import ${m.pkg}.PluginState;`,
    ...[...panels.values()].map((c) => `import ${m.pkg}.${c};`), '',
    ...(others.some((s) => s.surface === 'dialog') ? ['import javax.swing.JOptionPane;'] : []),
    'import java.util.prefs.Preferences;', '',
    '/**',
    ` * TAKX app plugin "${commentSafe(p.meta.name)}". ${HEADER_NOTE}`,
    ' * Shape follows the TAKX 5.8.0 SDK curriculum (RavenAppPlugin): UI is mounted in start() and removed in stop(),',
    ' * on the Swing event thread via @InvokeOnEDT.',
    ` * Add the icon at src/main/resources/${icon} (the iconPath below).`,
    ' */',
    '@AppPlugin(',
    `${J}${J}spec = @PluginSpecification(`,
    `${J}${J}${J}${J}family = ${cls}.FAMILY,`,
    `${J}${J}${J}${J}type = ${cls}.TYPE,`,
    `${J}${J}${J}${J}version = ${cls}.VERSION,`,
    `${J}${J}${J}${J}iconPath = ${strLit(icon)}`,
    `${J}${J}),`,
    `${J}${J}descriptor = @PluginDescriptor(`,
    `${J}${J}${J}${J}name = ${strLit(p.meta.name)},`,
    `${J}${J}${J}${J}description = ${strLit(p.meta.description || p.meta.name)}`,
    `${J}${J})`,
    ')',
    '@SuppressWarnings("UnusedDeclaration")',
    `public class ${cls} extends AAppPlugin {`, '',
    `${J}public static final String FAMILY = ${strLit(p.meta.packageId)};`,
    `${J}public static final String TYPE = ${strLit(p.meta.name)};`,
    `${J}public static final String VERSION = ${strLit(p.meta.version)};`, '',
    `${J}private final PluginState state = new PluginState();`,
    `${J}private final Preferences prefs = Preferences.userNodeForPackage(PluginState.class);`,
    `${J}/** TODO: replace DefaultActions with the real implementation (each method's doc says what to do) */`,
    `${J}private final Actions actions = new DefaultActions(state);`,
    `${J}private ${entryPanel} panel;`, '',
    `${J}@Override`, `${J}public void start() {`, `${J}${J}state.load(prefs);`, `${J}${J}setupUI();`, `${J}}`, '',
    `${J}@InvokeOnEDT`, `${J}private void setupUI() {`,
    `${J}${J}panel = new ${entryPanel}(state, actions);`,
    `${J}${J}ComponentDescriptor descriptor = new ComponentDescriptorBuilder(panel, ${strLit(entry.title)})`,
    `${J}${J}${J}${J}.setIcon(getClass().getClassLoader().getResource(${strLit(icon)}))`,
    `${J}${J}${J}${J}.setComponentPosition(ComponentPosition.RIGHT)`,
    `${J}${J}${J}${J}.setToolbarButtonVisible(true) // the design's launch button`,
    `${J}${J}${J}${J}.setTooltipText(${strLit(p.entry.label)})`,
    `${J}${J}${J}${J}.build();`,
    `${J}${J}IUISpaceManager ui = delegate.getUISpaceManager();`,
    `${J}${J}ui.addComponent(descriptor, panel);`,
    `${J}${J}ui.showComponent(panel);`,
    `${J}}`, '',
    ...others.flatMap((s) => {
      const pc = panels.get(s.id)!;
      return s.surface === 'dialog'
        ? [`${J}/** Show the "${commentSafe(s.title)}" dialog. */`, `${J}@InvokeOnEDT`, `${J}public void show${pascal(s.id)}() {`,
          `${J}${J}JOptionPane.showMessageDialog(panel, new ${pc}(state, actions), ${strLit(s.title)}, JOptionPane.PLAIN_MESSAGE);`, `${J}}`, '']
        : [`${J}/** Open the "${commentSafe(s.title)}" ${s.surface === 'settings' ? 'settings ' : ''}panel. */`, `${J}@InvokeOnEDT`, `${J}public void show${pascal(s.id)}() {`,
          `${J}${J}${pc} other = new ${pc}(state, actions);`,
          `${J}${J}delegate.getUISpaceManager().addComponent(new ComponentDescriptorBuilder(other, ${strLit(s.title)}).setComponentPosition(ComponentPosition.RIGHT).build(), other);`,
          `${J}${J}delegate.getUISpaceManager().showComponent(other);`, `${J}}`, ''];
    }),
    `${J}@Override`, `${J}public void stop() {`, `${J}${J}state.save(prefs);`, `${J}${J}teardownUI();`, `${J}}`, '',
    `${J}@InvokeOnEDT`, `${J}private void teardownUI() {`, `${J}${J}if (panel != null) delegate.getUISpaceManager().removeComponent(panel);`, `${J}}`, '',
    `${J}@Override`, `${J}public void shutdown() {`, `${J}${J}panel = null;`, `${J}}`,
    '}', '',
  ].join('\n');
}

export function emitTakx(p: Project): FileMap {
  const m = buildModel(p);
  const dir = `src/main/java/${m.pkg.replace(/\./g, '/')}`;
  const files: FileMap = {
    [`${dir}/PluginState.java`]: pluginStateJava(p, m, 'desktop'),
    [`${dir}/Actions.java`]: actionsJava(p, m),
    [`${dir}/DefaultActions.java`]: defaultActionsJava(p, m),
  };
  const panels = new Map<string, string>();
  const lines: string[] = [];
  for (const s of p.screens) {
    const cls = `${pascal(s.id)}Panel`;
    panels.set(s.id, cls);
    files[`${dir}/${cls}.java`] = panelJava(p, m, s, cls);
    lines.push(`- **${s.title}** (${s.surface}) → \`${cls}\`${p.entry.openScreen === s.id ? ' (mounted in start(), with a toolbar button)' : ` (open with \`show${pascal(s.id)}()\`)`}`);
  }
  const pluginCls = `${pascal(p.meta.name || 'Plugin')}Plugin`;
  files[`src/main/java/${p.meta.packageId.replace(/\./g, '/')}/${pluginCls}.java`] = pluginJava(p, m, panels);
  files['SCAFFOLD.md'] = [
    `# TAKX scaffold: ${p.meta.name}`, '', HEADER_NOTE, '',
    'Java 17 + Swing, shaped after the TAKX 5.8.0 SDK curriculum\'s app plugin (RavenAppPlugin). Then:', '',
    '1. Start from the SDK\'s plugin project (`takx-raven-plugin-offline`): copy its `build.gradle` / `settings.gradle`, set',
    '   `takxInstallDir`, `takxVersion`, `takKernelVersion` and `worldwindVersion` to match your TAKX install, and drop `src/` in.',
    `2. Add the plugin icon at \`src/main/resources/${p.meta.packageId.split('.').pop()}.png\`.`,
    `3. Implement \`DefaultActions\` (or your own \`Actions\`): each method's doc is the designer's description. After changing`,
    '   state from an action, call the panel\'s `render()` on the EDT.',
    '4. Remembered fields load in `start()` and save in `stop()` (java.util.prefs). Swap in a TAKX settings API if your build has one.',
    '5. Globe interactions (pick a point, show on map) are TODOs: see the SDK\'s RavenAppPanel for `delegate.getGlobeManager()`.', '',
    '## Screens', '', ...lines, '',
    '## Verified', '',
    'The builder\'s tests compile this scaffold with `javac --release 17`: panels, state and actions against the JDK, and',
    `\`${pluginCls}\` against stubs of the ten TAKX API types it uses, written from the 5.8.0 Javadoc signatures. Building against the`,
    'real `gov.takx:platform` jar still needs a TAKX install.', '',
  ].join('\n');
  return files;
}
