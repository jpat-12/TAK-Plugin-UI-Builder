// The component catalog: what each container/element is, which props it takes, what it can
// bind to, which events it fires, and how well each target supports it (PLAN.md §5).
//
// This is the single source the validator, palette, inspector, skins and emitters all read.
// Adding a component = adding an entry here; nothing else should hard-code type names.
//
// Support levels are a planning aid for the designer and the agent, not a guarantee:
//   native  — a stock widget exists on that platform
//   approx  — buildable, but composed from other widgets or styled to look the part
//   none    — no sensible implementation; the validator warns if the target is selected
//   unverified — not yet checked against the platform (none today: TAKX was verified from its
//                5.8.0 SDK on 2026-11-10 — Swing panels mounted via IUISpaceManager)

import type { ContainerType, StateType, Target } from './types';

export type Support = 'native' | 'approx' | 'none' | 'unverified';
export type SupportMatrix = Record<Target, Support>;

export type PropSpec =
  // noSpell: machine-ish values (icon names, field keys, MIME types) the spell checker skips
  | { kind: 'string'; label: string; required?: boolean; default?: string; multiline?: boolean; noSpell?: boolean }
  | { kind: 'number'; label: string; required?: boolean; default?: number; min?: number; max?: number }
  | { kind: 'boolean'; label: string; default?: boolean }
  | { kind: 'enum'; label: string; options: readonly string[]; default?: string }
  | { kind: 'stringList'; label: string; default?: string[]; noSpell?: boolean };

export type Category = 'layout' | 'text' | 'input' | 'display' | 'data' | 'tak';

export interface ComponentSpec {
  label: string;
  category: Category;
  /** Shown in the palette tooltip — plain language for non-coders (PLAN.md D5) */
  description: string;
  props: Record<string, PropSpec>;
  /** State types this may bind to; omitted = binding not allowed */
  bindTypes?: readonly StateType[];
  events?: readonly string[];
  support: SupportMatrix;
}

const ALL_NATIVE: SupportMatrix = { atak: 'native', wintak: 'native', webtak: 'native', cloudtak: 'native', takx: 'native' };
const support = (o: Partial<SupportMatrix>): SupportMatrix => ({ ...ALL_NATIVE, ...o });

const ALIGN = ['start', 'center', 'end', 'stretch'] as const;
const BUTTON_STYLE = ['primary', 'secondary', 'danger', 'subtle'] as const;

export const CONTAINERS: Record<ContainerType, ComponentSpec> = {
  stack: {
    label: 'Vertical stack', category: 'layout',
    description: 'Puts things on top of each other, top to bottom.',
    props: { gap: { kind: 'number', label: 'Spacing', default: 8, min: 0 }, align: { kind: 'enum', label: 'Align', options: ALIGN, default: 'stretch' } },
    support: ALL_NATIVE,
  },
  row: {
    label: 'Row', category: 'layout',
    description: 'Puts things side by side, left to right.',
    props: { gap: { kind: 'number', label: 'Spacing', default: 8, min: 0 }, align: { kind: 'enum', label: 'Align', options: ALIGN, default: 'center' }, wrap: { kind: 'boolean', label: 'Wrap to next line', default: false } },
    support: ALL_NATIVE,
  },
  tabs: {
    label: 'Tabs', category: 'layout',
    description: 'Tabbed pages. Each child is one tab and its title is the tab name.',
    props: {},
    support: ALL_NATIVE,
  },
  section: {
    label: 'Section', category: 'layout',
    description: 'A titled group, like a card.',
    props: { title: { kind: 'string', label: 'Title' } },
    support: ALL_NATIVE,
  },
  collapsible: {
    label: 'Collapsible section', category: 'layout',
    description: 'A titled group the user can open and close.',
    props: { title: { kind: 'string', label: 'Title', required: true }, startOpen: { kind: 'boolean', label: 'Starts open', default: true } },
    support: support({ atak: 'approx' }),
  },
  scroll: {
    label: 'Scroll area', category: 'layout',
    description: 'Lets its contents scroll when they do not fit.',
    props: {},
    support: ALL_NATIVE,
  },
  list: {
    label: 'Repeating list', category: 'data',
    description: 'Shows one row per item in a list. Design the row once; inside it, bind to $item.<field>.',
    props: { emptyText: { kind: 'string', label: 'Text when empty', default: 'Nothing here yet' }, dividers: { kind: 'boolean', label: 'Lines between rows', default: true } },
    bindTypes: ['list'],
    events: ['itemClick'],
    support: ALL_NATIVE,
  },
};

export const ELEMENTS: Record<string, ComponentSpec> = {
  // ---- text ----
  heading: {
    label: 'Heading', category: 'text', description: 'A bold title.',
    props: { text: { kind: 'string', label: 'Text', required: true }, level: { kind: 'enum', label: 'Size', options: ['1', '2', '3'], default: '2' } },
    support: ALL_NATIVE,
  },
  label: {
    label: 'Text', category: 'text', description: 'A line of text. Bind it to show a live value.',
    props: { text: { kind: 'string', label: 'Text', multiline: true }, muted: { kind: 'boolean', label: 'Muted', default: false } },
    bindTypes: ['string', 'number', 'boolean', 'enum', 'datetime', 'point', 'contact'],
    support: ALL_NATIVE,
  },

  // ---- input ----
  button: {
    label: 'Button', category: 'input', description: 'Something to tap. Pick the action it runs.',
    props: { text: { kind: 'string', label: 'Text', required: true }, style: { kind: 'enum', label: 'Style', options: BUTTON_STYLE, default: 'primary' }, fullWidth: { kind: 'boolean', label: 'Full width', default: false } },
    events: ['click'],
    support: ALL_NATIVE,
  },
  'icon-button': {
    label: 'Icon button', category: 'input', description: 'A small button that shows only an icon.',
    props: { icon: { kind: 'string', label: 'Icon hint', required: true, noSpell: true }, tooltip: { kind: 'string', label: 'Tooltip / accessibility label', required: true } },
    events: ['click'],
    support: ALL_NATIVE,
  },
  'text-input': {
    label: 'Text box', category: 'input', description: 'A one-line text field.',
    props: { label: { kind: 'string', label: 'Label' }, placeholder: { kind: 'string', label: 'Placeholder' }, required: { kind: 'boolean', label: 'Required', default: false } },
    bindTypes: ['string'], events: ['change'],
    support: ALL_NATIVE,
  },
  'number-input': {
    label: 'Number box', category: 'input', description: 'A field that only accepts numbers.',
    props: { label: { kind: 'string', label: 'Label' }, min: { kind: 'number', label: 'Minimum' }, max: { kind: 'number', label: 'Maximum' }, unit: { kind: 'string', label: 'Unit (e.g. ft, min)' } },
    bindTypes: ['number'], events: ['change'],
    support: ALL_NATIVE,
  },
  'text-area': {
    label: 'Notes box', category: 'input', description: 'A multi-line text field.',
    props: { label: { kind: 'string', label: 'Label' }, placeholder: { kind: 'string', label: 'Placeholder' }, rows: { kind: 'number', label: 'Visible lines', default: 3, min: 1 } },
    bindTypes: ['string'], events: ['change'],
    support: ALL_NATIVE,
  },
  dropdown: {
    label: 'Dropdown', category: 'input', description: 'Pick one from a list. Options come from the bound choice field, or the Options prop.',
    props: { label: { kind: 'string', label: 'Label' }, options: { kind: 'stringList', label: 'Options (if not bound to a choice field)' } },
    bindTypes: ['enum', 'string'], events: ['change'],
    support: ALL_NATIVE,
  },
  checkbox: {
    label: 'Checkbox', category: 'input', description: 'A yes/no tick box.',
    props: { label: { kind: 'string', label: 'Label', required: true } },
    bindTypes: ['boolean'], events: ['change'],
    support: ALL_NATIVE,
  },
  toggle: {
    label: 'Switch', category: 'input', description: 'An on/off switch.',
    props: { label: { kind: 'string', label: 'Label', required: true } },
    bindTypes: ['boolean'], events: ['change'],
    support: support({ webtak: 'approx' }),
  },
  'radio-group': {
    label: 'Radio buttons', category: 'input', description: 'Pick one; all options are visible at once.',
    props: { label: { kind: 'string', label: 'Label' }, horizontal: { kind: 'boolean', label: 'Side by side', default: false } },
    bindTypes: ['enum'], events: ['change'],
    support: ALL_NATIVE,
  },
  slider: {
    label: 'Slider', category: 'input', description: 'Drag to pick a number in a range.',
    props: { label: { kind: 'string', label: 'Label' }, min: { kind: 'number', label: 'Minimum', default: 0 }, max: { kind: 'number', label: 'Maximum', default: 100 }, step: { kind: 'number', label: 'Step', default: 1 } },
    bindTypes: ['number'], events: ['change'],
    support: ALL_NATIVE,
  },
  datetime: {
    label: 'Date / time', category: 'input', description: 'Pick a date, a time, or both.',
    props: { label: { kind: 'string', label: 'Label' }, mode: { kind: 'enum', label: 'Pick', options: ['date', 'time', 'datetime'], default: 'datetime' } },
    bindTypes: ['datetime'], events: ['change'],
    support: support({ atak: 'approx' }),
  },
  'color-picker': {
    label: 'Color picker', category: 'input', description: 'Pick a color.',
    props: { label: { kind: 'string', label: 'Label' } },
    bindTypes: ['string'], events: ['change'],
    support: support({ atak: 'approx', webtak: 'approx' }),
  },

  // ---- display ----
  image: {
    label: 'Image', category: 'display', description: 'A picture or logo.',
    props: { alt: { kind: 'string', label: 'Description (accessibility)', required: true }, hint: { kind: 'string', label: 'What image (for the agent)' }, height: { kind: 'number', label: 'Height (dp/px)' } },
    bindTypes: ['string'],
    support: ALL_NATIVE,
  },
  divider: {
    label: 'Divider', category: 'display', description: 'A thin line to separate things.',
    props: {},
    support: ALL_NATIVE,
  },
  progress: {
    label: 'Progress bar', category: 'display', description: 'Shows how far along something is. Leave unbound for a spinner-style bar.',
    props: { label: { kind: 'string', label: 'Label' }, max: { kind: 'number', label: 'Maximum', default: 100 } },
    bindTypes: ['number'],
    support: ALL_NATIVE,
  },
  'status-badge': {
    label: 'Status badge', category: 'display', description: 'A colored pill showing a status. Colors come from the bound choice field.',
    props: { size: { kind: 'enum', label: 'Size', options: ['small', 'large'], default: 'small' } },
    bindTypes: ['enum'],
    support: support({ atak: 'approx', wintak: 'approx' }),
  },
  'empty-state': {
    label: 'Empty message', category: 'display', description: 'A friendly message for when there is nothing to show.',
    props: { text: { kind: 'string', label: 'Text', required: true }, icon: { kind: 'string', label: 'Icon hint', noSpell: true } },
    support: ALL_NATIVE,
  },

  // ---- data ----
  table: {
    label: 'Table', category: 'data', description: 'Rows and columns from a list. Columns are item field names.',
    props: { columns: { kind: 'stringList', label: 'Columns (item fields)', noSpell: true }, emptyText: { kind: 'string', label: 'Text when empty', default: 'No rows' } },
    bindTypes: ['list'], events: ['rowClick'],
    support: support({ atak: 'approx' }),
  },

  // ---- TAK-specific: the reason this tool beats a generic UI builder ----
  'map-point-picker': {
    label: 'Pick point on map', category: 'tak', description: 'The user taps the map to set a location.',
    props: { label: { kind: 'string', label: 'Label', default: 'Location' }, buttonText: { kind: 'string', label: 'Button text', default: 'Pick on map' } },
    bindTypes: ['point'], events: ['change'],
    support: support({ webtak: 'approx' }),
  },
  'coordinate-field': {
    label: 'Coordinate field', category: 'tak', description: 'Type or show a location as MGRS or lat/lon.',
    props: { label: { kind: 'string', label: 'Label', default: 'Coordinates' }, format: { kind: 'enum', label: 'Format', options: ['mgrs', 'latlon-dd', 'latlon-dms', 'utm'], default: 'mgrs' }, readOnly: { kind: 'boolean', label: 'Display only', default: false } },
    bindTypes: ['point'], events: ['change'],
    support: support({ webtak: 'approx', cloudtak: 'approx' }),
  },
  'contact-picker': {
    label: 'Contact picker', category: 'tak', description: 'Choose a TAK user or team.',
    props: { label: { kind: 'string', label: 'Label', default: 'Send to' }, multiple: { kind: 'boolean', label: 'Allow several', default: false } },
    bindTypes: ['contact'], events: ['change'],
    support: support({ webtak: 'approx', cloudtak: 'approx' }),
  },
  callsign: {
    label: 'Callsign', category: 'tak', description: 'Shows a callsign with its team color. Unbound = my own callsign.',
    props: { showTeamColor: { kind: 'boolean', label: 'Show team color', default: true } },
    bindTypes: ['contact', 'string'],
    support: support({ webtak: 'approx' }),
  },
  'map-item-ref': {
    label: 'Map item', category: 'tak', description: 'Shows a marker from the map (by UID) and lets the user jump to it.',
    props: { label: { kind: 'string', label: 'Label' } },
    bindTypes: ['string'], events: ['click'],
    support: support({ webtak: 'approx' }),
  },
  'open-on-map': {
    label: 'Show on map button', category: 'tak', description: 'Pans and zooms the map to a location.',
    props: { text: { kind: 'string', label: 'Text', default: 'Show on map' } },
    bindTypes: ['point'],
    support: ALL_NATIVE,
  },
  'cot-type-picker': {
    label: 'Marker type picker', category: 'tak', description: 'Choose a CoT / 2525 marker type.',
    props: { label: { kind: 'string', label: 'Label', default: 'Type' }, allowed: { kind: 'stringList', label: 'Allowed CoT types (blank = all)', noSpell: true } },
    bindTypes: ['string'], events: ['change'],
    support: support({ webtak: 'approx', cloudtak: 'approx' }),
  },
  'data-package-attach': {
    label: 'Attach file / data package', category: 'tak', description: 'Attach a photo, file or data package.',
    props: { label: { kind: 'string', label: 'Label', default: 'Attachment' }, accept: { kind: 'stringList', label: 'File types (e.g. image/*)', noSpell: true } },
    bindTypes: ['string'], events: ['change'],
    support: support({ webtak: 'approx' }),
  },
  'chat-send': {
    label: 'GeoChat message', category: 'tak', description: 'A box + send button that posts to GeoChat.',
    props: { placeholder: { kind: 'string', label: 'Placeholder', default: 'Message' } },
    events: ['send'],
    support: support({ webtak: 'approx', cloudtak: 'approx' }),
  },
};

// TAKX (Swing): components with no stock Swing widget or that need the TAKX globe/contacts APIs.
// Applied after the tables so each entry above keeps reading as "how the other platforms do".
const TAKX_APPROX = ['collapsible', 'list', 'toggle', 'status-badge', 'icon-button', 'map-point-picker', 'coordinate-field',
  'contact-picker', 'callsign', 'map-item-ref', 'cot-type-picker', 'data-package-attach', 'chat-send'];
// copy before writing: components that use ALL_NATIVE directly share that one object
for (const [type, spec] of Object.entries({ ...CONTAINERS, ...ELEMENTS })) if (TAKX_APPROX.includes(type)) spec.support = { ...spec.support, takx: 'approx' };

/** Look up either kind; undefined means the type name is unknown */
export function componentSpec(kind: 'container' | 'element', type: string): ComponentSpec | undefined {
  return kind === 'container' ? CONTAINERS[type as ContainerType] : ELEMENTS[type];
}
