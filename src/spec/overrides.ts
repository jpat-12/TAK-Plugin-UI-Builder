// Per-platform view of a node. Shared by the preview (skins) and the code emitters, so a
// component looks and generates the same way on a given target.

import type { Node, Props, Target, TargetOverrides } from './types';

/** The node as the given platform sees it: per-target prop overrides applied */
export function withOverrides<T extends { props: Props; targetOverrides?: TargetOverrides }>(n: T, t: Target): T {
  const o = n.targetOverrides?.[t]?.props;
  return o ? { ...n, props: { ...n.props, ...o } } : n;
}

export const hiddenOn = (n: Node, t: Target) => n.targetOverrides?.[t]?.hidden === true;
