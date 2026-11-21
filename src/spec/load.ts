// Entry point for any spec coming from outside the store: localStorage, a file import, a
// pasted JSON, (Phase 4) a Claude-drafted layout. Order: migrate → shape-check → semantic
// validate. Nothing else should call projectSchema.parse directly.

import type { ZodIssue } from 'zod';
import { projectSchema } from './schema';
import { SPEC_VERSION, type Project } from './types';
import { validateProject, type Issue } from './validate';

export type LoadResult =
  | { ok: true; project: Project; issues: Issue[] }
  | { ok: false; issues: Issue[] };

/**
 * Upgrades from older spec versions, keyed by the version they upgrade FROM. Empty while
 * v1 is the only version — when the schema breaks, bump SPEC_VERSION and add a step here
 * (with a fixture test) instead of editing old files by hand.
 */
const MIGRATIONS: Record<string, (raw: Record<string, unknown>) => Record<string, unknown>> = {};

export function loadProject(raw: unknown): LoadResult {
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch (e) {
      return { ok: false, issues: [{ severity: 'error', path: '', message: `This isn't valid JSON: ${(e as Error).message}` }] };
    }
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, issues: [{ severity: 'error', path: '', message: "This isn't a TAK UI Builder project file." }] };
  }

  let obj = raw as Record<string, unknown>;
  for (let guard = 0; obj.spec !== SPEC_VERSION && guard < 20; guard++) {
    const step = MIGRATIONS[String(obj.spec)];
    if (!step) {
      return { ok: false, issues: [{ severity: 'error', path: '/spec', message: `Unknown project format "${String(obj.spec)}" — this builder reads ${SPEC_VERSION}.` }] };
    }
    obj = step(obj);
  }

  const parsed = projectSchema.safeParse(obj);
  if (!parsed.success) return { ok: false, issues: parsed.error.issues.map(zodToIssue) };

  const issues = validateProject(parsed.data);
  return { ok: true, project: parsed.data, issues };
}

export const hasErrors = (issues: Issue[]) => issues.some((i) => i.severity === 'error');

function zodToIssue(z: ZodIssue): Issue {
  const path = '/' + z.path.join('/');
  // union failures (node = container | element) bury the useful message; surface the first branch's
  if (z.code === 'invalid_union' && z.unionErrors[0]?.issues[0]) return zodToIssue(z.unionErrors[0].issues[0]);
  return { severity: 'error', path, message: `${path}: ${z.message}` };
}
