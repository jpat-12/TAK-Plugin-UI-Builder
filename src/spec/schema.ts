// Structural (shape) schema for takui/v1. Cross-references — bind keys, action ids, catalog
// prop types, support warnings — are checked in validate.ts, because they need the whole
// project and the catalog, which a JSON Schema can't express.
//
// Emptiness of human text (names, labels, intents, titles) is NOT a shape error: a project
// mid-edit must still save and reload, so validate.ts reports blanks as normal errors.
// Format rules (ids, packageId, version) stay here; the inspector refuses to commit bad formats.
//
// No .default() here: defaults live in load.ts so input and output types stay identical
// and the `z.ZodType<T>` annotations below keep this file locked to types.ts.

import { z } from 'zod';
import {
  ACTION_KINDS, CONTAINER_TYPES, SPEC_VERSION, STATE_TYPES, SURFACES, TARGETS,
  type Action, type ContainerNode, type HandoffSettings, type ElementNode, type Entry, type Node, type Project,
  type ProjectMeta, type Screen, type Theme, type StateField, type TargetOverrides, type VisibleWhen,
} from './types';

/** Code-safe identifier: emitters turn these into Java/C#/TS names */
const ident = z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]*$/, 'must start with a letter and use only letters, digits and _');
/** Node / screen / action ids may also use dashes (emitters convert to camelCase) */
const id = z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]*$/, 'must start with a letter and use only letters, digits, - and _');

const target = z.enum(TARGETS);
const propValue = z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]);
const props = z.record(propValue);
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'must be a #RRGGBB hex color');

const metaSchema: z.ZodType<ProjectMeta> = z.object({
  name: z.string(),
  packageId: z.string().regex(/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/, 'must look like org.example.myplugin (lowercase, dot-separated)'),
  version: z.string().regex(/^\d+\.\d+\.\d+$/, 'must be MAJOR.MINOR.PATCH'),
  description: z.string(),
  author: z.string().optional(),
  targets: z.array(target).min(1, 'pick at least one target platform'),
  spellingAllow: z.array(z.string()).optional(),
}).strict();

const stateFieldSchema: z.ZodType<StateField> = z.lazy(() => z.object({
  key: ident,
  label: z.string().optional(),
  type: z.enum(STATE_TYPES),
  description: z.string().optional(),
  options: z.array(z.object({
    value: z.string().min(1),
    label: z.string(),
    color: hex.optional(),
  }).strict()).optional(),
  itemFields: z.array(stateFieldSchema).optional(),
  default: z.union([z.string(), z.number(), z.boolean(), z.null()]).optional(),
  persisted: z.boolean().optional(),
}).strict());

const actionSchema: z.ZodType<Action> = z.object({
  id,
  label: z.string(),
  intent: z.string(),
  kind: z.enum(ACTION_KINDS),
  params: z.record(z.string()).optional(),
}).strict();

const entrySchema: z.ZodType<Entry> = z.object({
  label: z.string(),
  icon: z.string().optional(),
  iconImage: z.string().regex(/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/, 'must be a PNG image (base64 data: URL)').optional(),
  openScreen: id,
}).strict();

const themeSchema: z.ZodType<Theme> = z.object({
  accent: hex.optional(),
  primary: hex.optional(),
  header: hex.optional(),
}).strict();

const visibleWhenSchema: z.ZodType<VisibleWhen> = z.object({
  key: z.string().min(1),
  op: z.enum(['eq', 'neq', 'truthy', 'falsy']),
  value: z.union([z.string(), z.number(), z.boolean()]).optional(),
}).strict();

const targetOverridesSchema: z.ZodType<TargetOverrides> = z.object(
  Object.fromEntries(TARGETS.map((t) => [t, z.object({ hidden: z.boolean().optional(), props: props.optional() }).strict().optional()])),
).strict() as z.ZodType<TargetOverrides>;

const nodeBase = {
  id,
  props,
  visibleWhen: visibleWhenSchema.optional(),
  targetOverrides: targetOverridesSchema.optional(),
  bind: z.string().optional(),
  on: z.record(id).optional(),
};

export const containerSchema: z.ZodType<ContainerNode> = z.lazy(() => z.object({
  ...nodeBase,
  kind: z.literal('container'),
  type: z.enum(CONTAINER_TYPES),
  children: z.array(nodeSchema),
}).strict());

const elementSchema: z.ZodType<ElementNode> = z.object({
  ...nodeBase,
  kind: z.literal('element'),
  type: z.string().min(1),
}).strict();

export const nodeSchema: z.ZodType<Node> = z.lazy(() => z.union([containerSchema, elementSchema]));

const screenSchema: z.ZodType<Screen> = z.object({
  id,
  title: z.string(),
  surface: z.enum(SURFACES),
  root: containerSchema,
}).strict();

const handoffSchema: z.ZodType<HandoffSettings> = z.object({
  notes: z.string().optional(),
  starters: z.object(Object.fromEntries(TARGETS.map((t) => [t, z.string().optional()]))).strict().optional() as z.ZodType<HandoffSettings['starters']>,
}).strict();

export const projectSchema: z.ZodType<Project> = z.object({
  spec: z.literal(SPEC_VERSION),
  meta: metaSchema,
  state: z.array(stateFieldSchema),
  actions: z.array(actionSchema),
  entry: entrySchema,
  theme: themeSchema.optional(),
  screens: z.array(screenSchema).min(1, 'a plugin needs at least one screen'),
  handoff: handoffSchema.optional(),
}).strict();
