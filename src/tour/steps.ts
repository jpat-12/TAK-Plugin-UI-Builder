// The guided tour: build a tiny "Shift Check-In" plugin by hand. Each step names an element to
// highlight (data-tour hooks) and a check() that, once true, advances the tour by itself, so
// the user learns by doing instead of reading.

import { leftTab, signals } from '../app/ui';
import { previewTarget } from '../canvas/view';
import { walk } from '../spec/tree';
import type { Node } from '../spec/types';
import type { useProject } from '../store/project';

type Store = ReturnType<typeof useProject>;

export interface Step {
  title: string;
  /** may be a function so the copy can react to state (e.g. "click the heading first") */
  text: string | ((s: Store) => string);
  /** CSS selector to spotlight; function form picks based on state */
  target?: string | ((s: Store) => string | undefined);
  /** true = step done; tour advances. Omit for steps with a Next button. */
  check?: (s: Store) => boolean;
  /** "Show me" animation of the step's action, played by a ghost cursor over the real UI */
  demo?: Demo | ((s: Store) => Demo | undefined);
}

/**
 * Ghost-cursor animations (tour/Demo.vue). Selectors resolve live every frame, so demos
 * follow panels that scroll or resize. `to: PANE` drops just below the pane's last component.
 */
export type Demo =
  | { kind: 'drag'; from: string; to: string }
  | { kind: 'click'; at: string }
  | { kind: 'type'; at: string; text: string }
  | { kind: 'keys'; at: string; keys: string[] };

export const PANE = '[data-tour="pane"] .cn.root';
const SELECTED = '.cn.selected';
const typed = (at: string, text: string): Demo => ({ kind: 'type', at, text });
const click = (at: string): Demo => ({ kind: 'click', at });
/** when the palette isn't showing, the first move is clicking back to the Add tab */
const dragIn = (pal: string) => (): Demo =>
  leftTab.value === 'add' ? { kind: 'drag', from: pal, to: PANE } : click('[data-tour="tab-add"]');
/** first input after the Settings heading = the component's main text prop */
const MAIN_TEXT = '[data-tour="settings"] ~ label input';
const onPane = (cls: string) => `[data-tour="pane"] ${cls}`;

const find = (s: Store, type: string): Node | undefined => {
  for (const sc of s.project.screens) for (const n of walk(sc.root)) if (n.type === type) return n;
  return undefined;
};
const selectedIs = (s: Store, type: string) => s.selected?.node.type === type;
const inAddTab = (sel: string) => () => (leftTab.value === 'add' ? sel : '[data-tour="tab-add"]');

export const STEPS: Step[] = [
  {
    title: 'Welcome',
    text: "Let's build a tiny Shift Check-In plugin together. It takes about 2 minutes. Each step highlights where to click and moves on by itself once you've done it.",
  },
  {
    title: '1 · Name your plugin',
    text: 'In the Plugin panel on the right, change Name to "Shift Check-In".',
    target: '[data-tour="plugin-name"]',
    demo: typed('[data-tour="plugin-name"] input', 'Shift Check-In'),
    check: (s) => !!s.project.meta.name.trim() && s.project.meta.name !== 'My Plugin',
  },
  {
    title: '2 · Add a heading',
    text: 'Drag Heading from the palette on the left and drop it on the dark pane. (Or just click Heading.)',
    target: inAddTab('[data-tour="pal-heading"]'),
    demo: dragIn('[data-tour="pal-heading"]'),
    check: (s) => !!find(s, 'heading'),
  },
  {
    title: '3 · Change its text',
    text: (s) => (selectedIs(s, 'heading')
      ? 'In Settings on the right, change Text to something like "How\'s your shift?"'
      : 'Click the heading on the pane to select it, then change its Text on the right.'),
    target: (s) => (selectedIs(s, 'heading') ? '[data-tour="settings"]' : '[data-tour="pane"]'),
    demo: (s) => (selectedIs(s, 'heading') ? typed(MAIN_TEXT, "How's your shift?") : click(onPane('.cn.heading'))),
    check: (s) => { const h = find(s, 'heading'); return !!h && h.props.text !== 'Heading' && !!h.props.text; },
  },
  {
    title: '4 · Add a choice',
    text: 'Drag Radio buttons onto the pane, below the heading.',
    target: inAddTab('[data-tour="pal-radio-group"]'),
    demo: dragIn('[data-tour="pal-radio-group"]'),
    check: (s) => !!find(s, 'radio-group'),
  },
  {
    title: '5 · Connect it to data',
    text: (s) => (selectedIs(s, 'radio-group')
      ? 'Under "Connected data" on the right, choose "+ New data field…". The plugin now remembers the answer.'
      : 'Click the radio buttons on the pane to select them.'),
    target: (s) => (selectedIs(s, 'radio-group') ? '[data-tour="bind"]' : '[data-tour="pane"]'),
    demo: (s) => click(selectedIs(s, 'radio-group') ? '[data-tour="bind"]' : onPane('.cn.radio-group')),
    check: (s) => !!find(s, 'radio-group')?.bind,
  },
  {
    title: '6 · Name the choices',
    text: 'Open the Data tab (left). In the new field, change "Option 1" to "Fit for duty" and "Option 2" to "Need relief". Try the color squares too.',
    target: () => (leftTab.value === 'data' ? '.panel' : '[data-tour="tab-data"]'),
    demo: () => (leftTab.value === 'data' ? typed('.opt input:not([type=color])', 'Fit for duty') : click('[data-tour="tab-data"]')),
    check: (s) => {
      const key = find(s, 'radio-group')?.bind;
      const f = s.project.state.find((x) => x.key === key);
      return !!f?.options?.length && f.options.every((o) => !/^Option \d+$/.test(o.label));
    },
  },
  {
    title: '7 · Add a button',
    text: 'Back on the Add tab, drag a Button onto the pane below the radio buttons.',
    target: inAddTab('[data-tour="pal-button"]'),
    demo: dragIn('[data-tour="pal-button"]'),
    check: (s) => !!find(s, 'button'),
  },
  {
    title: '8 · Label the button',
    text: (s) => (selectedIs(s, 'button') ? 'Change its Text to "Send check-in".' : 'Click the button on the pane to select it.'),
    target: (s) => (selectedIs(s, 'button') ? '[data-tour="settings"]' : '[data-tour="pane"]'),
    demo: (s) => (selectedIs(s, 'button') ? typed(MAIN_TEXT, 'Send check-in') : click(onPane('.cn.button'))),
    check: (s) => { const b = find(s, 'button'); return !!b && b.props.text !== 'Button' && !!b.props.text; },
  },
  {
    title: '9 · Make it do something',
    text: (s) => (selectedIs(s, 'button')
      ? 'Under "When… click", choose "+ New action…".'
      : 'Click the button on the pane to select it.'),
    target: (s) => (selectedIs(s, 'button') ? '[data-tour="event-click"]' : '[data-tour="pane"]'),
    demo: (s) => click(selectedIs(s, 'button') ? '[data-tour="event-click"]' : onPane('.cn.button')),
    check: (s) => !!find(s, 'button')?.on?.click,
  },
  {
    title: '10 · Describe it in plain words',
    text: 'In "What should it do?", write what should happen, e.g. "Send my answer to the team lead as a CoT and show Sent". The coding agent builds from that sentence.',
    target: '[data-tour="intent"]',
    demo: typed('[data-tour="intent"] textarea', 'Send my answer to the team lead as a CoT'),
    check: (s) => {
      const id = find(s, 'button')?.on?.click;
      return (s.project.actions.find((a) => a.id === id)?.intent.trim().length ?? 0) >= 12;
    },
  },
  {
    title: '11 · Reorder without dragging',
    text: (s) => (selectedIs(s, 'button')
      ? 'Press Alt+↑ (or use "↑ Up" under Move on the right) to put the button above the radio buttons.'
      : 'Select the button, then press Alt+↑ (or use "↑ Up" under Move on the right).'),
    target: (s) => (selectedIs(s, 'button') ? '.move' : '[data-tour="pane"]'),
    demo: (s) => (selectedIs(s, 'button') ? { kind: 'keys', at: SELECTED, keys: ['Alt', '↑'] } : click(onPane('.cn.button'))),
    check: (s) => {
      const kids = s.screen.root.children.map((c) => c.type);
      return kids.indexOf('button') > -1 && kids.indexOf('button') < kids.indexOf('radio-group');
    },
  },
  {
    title: '12 · Check for problems',
    text: 'The bar at the bottom lists anything the coding agent would trip on, plus spelling. Click it to open the list. It should say no errors.',
    target: '[data-tour="problems"]',
    demo: click('[data-tour="problems"] .sum'),
    check: (s) => !s.issues.some((i) => i.severity === 'error'),
  },
  {
    title: '13 · See it on another platform',
    text: (s) => (s.project.meta.targets.includes('cloudtak')
      ? 'Now click CloudTAK in the preview switch above the canvas.'
      : 'Click empty space on the canvas, then tick CloudTAK under Platforms in the Plugin panel.'),
    target: (s) => (s.project.meta.targets.includes('cloudtak') ? '[data-tour="preview"]' : '[data-tour="platforms"]'),
    demo: (s) => (s.project.meta.targets.includes('cloudtak')
      ? click('[data-tour="preview"] button:last-child')
      : s.selected ? click('.stage') : click('[data-tour="platforms"] label:nth-child(4) input')),
    check: () => previewTarget.value === 'cloudtak',
  },
  {
    title: '14 · Save it',
    text: 'Click Save file. That .takui.json file is your design. Keep it so you can come back and change things.',
    target: '[data-tour="save"]',
    demo: click('[data-tour="save"]'),
    check: () => signals.value.saved,
  },
  {
    title: 'Done!',
    text: 'That\'s the whole loop: lay out, connect data, describe actions, check, save. When you\'re ready, "Export for agent…" (top right) packages it all for Claude Code. Next time, try New… → a template to start further along.',
  },
];
