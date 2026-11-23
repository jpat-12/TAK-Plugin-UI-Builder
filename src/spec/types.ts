// takui/v1 — the canonical, platform-neutral plugin UI spec (PLAN.md §4).
//
// This is the ONE editable record. Canvas, skins, HANDOFF.md, mockups and emitters are all
// projections of a Project; none of them may hold an editable copy (PLAN.md §2).
//
// Layout is structural (containers), never absolute X/Y: ATAK panes resize, CloudTAK is a
// fixed sidebar, WinTAK docks — pixel positions would not survive any of them.
//
// These types are hand-written (not z.infer'd) because Node is recursive; schema.ts is
// typed against them so the two cannot drift.

export const SPEC_VERSION = 'takui/v1' as const;

export const TARGETS = ['atak', 'wintak', 'webtak', 'cloudtak', 'takx'] as const;
export type Target = (typeof TARGETS)[number];

export interface Project {
  spec: typeof SPEC_VERSION;
  meta: ProjectMeta;
  state: StateField[];
  actions: Action[];
  entry: Entry;
  screens: Screen[];
  /** Extra guidance carried into HANDOFF.md (PLAN.md Phase 2). Optional. */
  handoff?: HandoffSettings;
}

export interface HandoffSettings {
  /** Free-text instructions for the coding agent: constraints, servers, people to ask */
  notes?: string;
  /** Per platform: repo, path or URL the agent should start from instead of a blank SDK project */
  starters?: Partial<Record<Target, string>>;
}

export interface ProjectMeta {
  name: string;
  /** Reverse-DNS id used as the Android package / .NET namespace / CloudTAK plugin key */
  packageId: string;
  version: string;
  description: string;
  author?: string;
  /** One design, all targets (PLAN.md D7) — at least one */
  targets: Target[];
  /** Project dictionary: words the spell checker accepts (names, local jargon). Lowercase. */
  spellingAllow?: string[];
}

// ---- State: the plugin's data model. Inputs bind to these keys. ----

export const STATE_TYPES = [
  'string', 'number', 'boolean', 'enum', 'datetime',
  'point',   // lat/lon (+ optional hae) — map-pick results, coordinate fields
  'contact', // a TAK contact/callsign (UID + callsign)
  'list',    // repeating records; shape given by itemFields
] as const;
export type StateType = (typeof STATE_TYPES)[number];

export interface EnumOption {
  value: string;
  label: string;
  /** Hex color — status-badge and list rows color by this; treat as load-bearing */
  color?: string;
}

export interface StateField {
  /** Identifier, unique within its scope (project, or a list's itemFields) */
  key: string;
  label?: string;
  type: StateType;
  description?: string;
  /** enum only */
  options?: EnumOption[];
  /** list only — fields of each item, referenced in a list template as `$item.<key>` */
  itemFields?: StateField[];
  default?: string | number | boolean | null;
  /** Survives plugin restart (ATAK SharedPreferences, localStorage, ...) */
  persisted?: boolean;
}

// ---- Actions: behavior is DECLARED, not coded. `intent` is written for the coding agent. ----

export const ACTION_KINDS = [
  'cot-send',  // build + send a CoT event
  'http',      // call a REST endpoint
  'map-pick',  // ask the user to tap a point on the map
  'navigate',  // open another screen (params.screen)
  'state-set', // change a state value (params.key, params.value)
  'notify',    // tell the user something: toast / notification (params.message)
  'custom',    // anything else — intent says what
] as const;
export type ActionKind = (typeof ACTION_KINDS)[number];

export interface Action {
  id: string;
  label: string;
  /** Plain-English "what this does" — the agent implements it from this sentence */
  intent: string;
  kind: ActionKind;
  params?: Record<string, string>;
}

// ---- Entry: how the user opens the plugin. Each target maps this to its native surface:
// ATAK toolbar tool, WinTAK ribbon button, CloudTAK home-menu icon, WebTAK menu entry. ----

export interface Entry {
  label: string;
  /** Free-text icon hint for the agent / iconset ("ambulance", "clipboard") */
  icon?: string;
  /** Screen opened by the entry point */
  openScreen: string;
}

// ---- Screens + node tree ----

export const SURFACES = ['pane', 'dialog', 'settings'] as const;
export type Surface = (typeof SURFACES)[number];

export interface Screen {
  id: string;
  title: string;
  /** pane = ATAK drop-down / CloudTAK panel / WinTAK dock pane; settings = native prefs where available */
  surface: Surface;
  root: ContainerNode;
}

export const CONTAINER_TYPES = ['stack', 'row', 'grid', 'tabs', 'section', 'collapsible', 'scroll', 'list'] as const;
export type ContainerType = (typeof CONTAINER_TYPES)[number];

/** Structured condition instead of an expression language — emitters must translate it per target */
export interface VisibleWhen {
  key: string;
  op: 'eq' | 'neq' | 'truthy' | 'falsy';
  value?: string | number | boolean;
}

export type PropValue = string | number | boolean | string[];
export type Props = Record<string, PropValue>;

export interface TargetOverride {
  hidden?: boolean;
  props?: Props;
}
export type TargetOverrides = Partial<Record<Target, TargetOverride>>;

interface NodeBase {
  /** Unique across the whole project (emitters turn these into view ids / refs) */
  id: string;
  props: Props;
  visibleWhen?: VisibleWhen;
  targetOverrides?: TargetOverrides;
}

export interface ContainerNode extends NodeBase {
  kind: 'container';
  type: ContainerType;
  /** list only: a `list` state key; children are the per-item template */
  bind?: string;
  /** list only: { itemClick: actionId } */
  on?: Record<string, string>;
  children: Node[];
}

export interface ElementNode extends NodeBase {
  kind: 'element';
  /** A key of ELEMENTS in catalog.ts */
  type: string;
  /** State key, or `$item.<field>` inside a list template */
  bind?: string;
  /** event name → action id; allowed events come from the catalog */
  on?: Record<string, string>;
}

export type Node = ContainerNode | ElementNode;
