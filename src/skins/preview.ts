// Sample values for the canvas preview: what a bound component shows before any real data
// exists. Shared by every skin so a project previews the same way on every target.

import type { ElementNode, EnumOption, Project, StateField } from '../spec/types';

export interface PreviewCtx {
  project: Project;
  /** The list item scope ($item.*) when rendering inside a repeating list */
  item?: StateField;
  /** Which sample row (0, 1, ...) inside a list, so ghost rows don't all look identical */
  row?: number;
}

export function resolveField(ctx: PreviewCtx, bind: string | undefined): StateField | undefined {
  if (!bind) return undefined;
  if (bind.startsWith('$item.')) return ctx.item?.itemFields?.find((f) => f.key === bind.slice(6));
  return ctx.project.state.find((f) => f.key === bind);
}

const SAMPLE_CALLSIGNS = ['MEDIC-1', 'MEDIC-2', 'ALPHA-3'];
const SAMPLE_MGRS = ['16S EJ 12345 67890', '16S EJ 12410 67755', '16S EJ 12290 67920'];

export function sampleValue(field: StateField | undefined, row = 0): string {
  if (!field) return '';
  const d = field.default;
  switch (field.type) {
    case 'string': {
      if (typeof d === 'string' && d) return d;
      const name = field.label ?? field.key[0]!.toUpperCase() + field.key.slice(1);
      return row ? `${name} ${row + 1}` : name;
    }
    case 'number': return String(typeof d === 'number' ? d : 42 + row);
    case 'boolean': return (d ?? false) ? 'Yes' : 'No';
    case 'enum': return enumSample(field, row)?.label ?? '';
    case 'datetime': return ['14:32', '14:47', '15:05'][row % 3]!;
    case 'point': return SAMPLE_MGRS[row % 3]!;
    case 'contact': return SAMPLE_CALLSIGNS[row % 3]!;
    case 'list': return `${row + 2} items`;
  }
}

/** Default option for row 0, then cycle — so a list of badges shows varied colors */
export function enumSample(field: StateField, row = 0): EnumOption | undefined {
  const opts = field.options ?? [];
  const di = Math.max(0, opts.findIndex((o) => o.value === field.default));
  return opts[(di + row) % Math.max(1, opts.length)];
}

export function optionsFor(node: ElementNode, ctx: PreviewCtx): EnumOption[] {
  const f = resolveField(ctx, node.bind);
  if (f?.type === 'enum' && f.options?.length) return f.options;
  const list = node.props.options;
  if (Array.isArray(list) && list.length) return list.map((v) => ({ value: v, label: v }));
  return [{ value: 'a', label: 'Option A' }, { value: 'b', label: 'Option B' }];
}


export { withOverrides } from '../spec/overrides';
