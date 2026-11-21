// Type-checks every template's CloudTAK scaffold with vue-tsc (strict + noUnusedLocals), the
// gate CloudTAK's own build applies. Files go under .emit-tmp/ inside the repo so `vue`
// resolves from this project's node_modules.

import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { emitCloudtak } from '../src/emit/cloudtak';
import { loadProject } from '../src/spec/load';
import { TEMPLATES } from '../src/templates';

const ROOT = join('.emit-tmp', 'cloudtak');

describe('CloudTAK scaffold', () => {
  it('every template type-checks with vue-tsc --strict', () => {
    rmSync(ROOT, { recursive: true, force: true });
    for (const t of TEMPLATES) {
      const r = loadProject(t.raw);
      if (!r.ok) throw new Error('bad template');
      for (const [path, body] of Object.entries(emitCloudtak(r.project))) {
        const full = join(ROOT, t.id, path);
        mkdirSync(dirname(full), { recursive: true });
        writeFileSync(full, body);
      }
    }
    writeFileSync(join(ROOT, 'tsconfig.json'), JSON.stringify({
      compilerOptions: {
        target: 'ES2022', module: 'ESNext', moduleResolution: 'Bundler', lib: ['ES2022', 'DOM'], strict: true,
        noUnusedLocals: true, noUnusedParameters: true, noEmit: true, skipLibCheck: true, jsx: 'preserve', types: [],
      },
      include: ['**/*.ts', '**/*.vue'],
    }));
    let output = '';
    try {
      execFileSync(process.execPath, [join('node_modules', 'vue-tsc', 'bin', 'vue-tsc.js'), '--noEmit', '-p', join(ROOT, 'tsconfig.json')], { stdio: 'pipe' });
    } catch (e) {
      const err = e as { stdout?: Buffer; stderr?: Buffer };
      output = (err.stdout?.toString() ?? '') + (err.stderr?.toString() ?? '');
    }
    expect(output).toBe('');
  }, 120_000);

  it('panels use v-model for bound inputs, v-if for show-when rules, v-for for lists', () => {
    const r = loadProject(TEMPLATES.find((t) => t.id === 'team-checkin')!.raw);
    if (!r.ok) throw new Error('bad template');
    const vue = emitCloudtak(r.project)['plugin/components/CheckinPanel.vue']!;
    expect(vue).toContain('v-model="state.isLead"');
    expect(vue).toContain('v-if="!!state.isLead"');
    expect(vue).toContain('v-for="(item, i1) in state.roster"');
    expect(vue).toContain('labelOf(ROSTER_ANSWER_OPTIONS, item.answer)');
  });
});
