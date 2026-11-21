// All code emitters (PLAN.md Phase 3). One FileMap per target the project builds for.
// TAKX was added 2026-11-10 after reading its 5.8.0 SDK (Swing + IUISpaceManager).

import type { Project, Target } from '../spec/types';
import { emitAtak } from './atak';
import { emitCloudtak } from './cloudtak';
import type { FileMap } from './common';
import { emitWebtak } from './webtak';
import { emitTakx } from './takx';
import { emitWintak } from './wintak';

export type { FileMap };

export const EMITTERS: Partial<Record<Target, (p: Project) => FileMap>> = {
  atak: emitAtak,
  cloudtak: emitCloudtak,
  wintak: emitWintak,
  webtak: emitWebtak,
  takx: emitTakx,
};

/** Generated scaffold per selected target that has an emitter */
export function emitScaffold(p: Project): Partial<Record<Target, FileMap>> {
  const out: Partial<Record<Target, FileMap>> = {};
  for (const t of p.meta.targets) {
    const emit = EMITTERS[t];
    if (emit) out[t] = emit(p);
  }
  return out;
}
