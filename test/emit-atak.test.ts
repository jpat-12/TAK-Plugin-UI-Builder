// Compiles every template's ATAK scaffold with the real Android toolchain:
//   aapt2 compile → aapt2 link (generates R.java) → javac against android.jar.
// Needs an Android SDK (ANDROID_HOME / LOCALAPPDATA/Android/Sdk) with build-tools + a platform,
// and javac on PATH; skips with a reason otherwise. No ATAK SDK needed: the scaffold is plain Android.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { emitAtak } from '../src/emit/atak';
import { loadProject } from '../src/spec/load';
import type { Project } from '../src/spec/types';
import { TEMPLATES } from '../src/templates';

function findSdk() {
  const roots = [process.env.ANDROID_HOME, process.env.ANDROID_SDK_ROOT, process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'Android', 'Sdk')].filter(Boolean) as string[];
  for (const root of roots) {
    const bt = join(root, 'build-tools');
    const pl = join(root, 'platforms');
    if (!existsSync(bt) || !existsSync(pl)) continue;
    const exe = process.platform === 'win32' ? 'aapt2.exe' : 'aapt2';
    const tools = readdirSync(bt).sort().reverse().map((v) => join(bt, v, exe)).find(existsSync);
    const jar = readdirSync(pl).sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1])).map((v) => join(pl, v, 'android.jar')).find(existsSync);
    if (tools && jar) return { aapt2: tools, androidJar: jar };
  }
  return undefined;
}
const sdk = findSdk();
let javac = false;
try { execFileSync('javac', ['-version'], { stdio: 'pipe' }); javac = true; } catch { /* no JDK: skip */ }

const load = (raw: unknown): Project => {
  const r = loadProject(raw);
  if (!r.ok) throw new Error('bad template');
  return r.project;
};

function listFiles(dir: string, ext: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? listFiles(join(dir, e.name), ext) : e.name.endsWith(ext) ? [join(dir, e.name)] : []));
}

describe('ATAK scaffold: structure', () => {
  const p = load(TEMPLATES.find((t) => t.id === 'event-cad')!.raw);
  const files = emitAtak(p);
  it('emits layouts, rows, prefs, values, drawables and Java', () => {
    const paths = Object.keys(files);
    expect(paths).toContain('app/src/main/res/layout/eventcad_screen_main.xml');
    expect(paths).toContain('app/src/main/res/layout/eventcad_row_incident_list.xml');
    expect(paths).toContain('app/src/main/res/layout/eventcad_row_unit_table.xml');
    expect(paths).toContain('app/src/main/res/xml/eventcad_prefs_settings.xml');
    expect(paths).toContain('app/src/main/java/org/example/eventcad/ui/MainViews.java');
    expect(paths).toContain('app/src/main/java/org/example/eventcad/ui/PluginState.java');
    expect(paths).toContain('app/src/main/java/org/example/eventcad/ui/Actions.java');
  });
  it('Actions carries each intent as Javadoc, with list items passed to row actions', () => {
    const a = files['app/src/main/java/org/example/eventcad/ui/Actions.java']!;
    expect(a).toContain('Show the tapped incident');
    expect(a).toMatch(/void openIncident\(PluginState\.IncidentsItem item\);/);
    expect(a).toMatch(/void setStatus\(\);/);
  });
  it('settings keys match PluginState preference keys', () => {
    const prefs = files['app/src/main/res/xml/eventcad_prefs_settings.xml']!;
    expect(prefs).toContain('android:key="org.example.eventcad.isDispatcher"');
    expect(files['app/src/main/java/org/example/eventcad/ui/PluginState.java']).toContain('PREF_PREFIX = "org.example.eventcad."');
  });
});

describe.skipIf(!sdk || !javac)(`ATAK scaffold: compiles with aapt2 + javac${sdk && javac ? '' : ' (SKIPPED: no Android SDK / javac found)'}`, () => {
  for (const t of TEMPLATES) {
    it(`${t.name}`, () => {
      const p = load(t.raw);
      const dir = mkdtempSync(join(tmpdir(), 'takui-atak-'));
      try {
        for (const [path, body] of Object.entries(emitAtak(p))) {
          const full = join(dir, path);
          mkdirSync(dirname(full), { recursive: true });
          writeFileSync(full, body);
        }
        const res = join(dir, 'app/src/main/res');
        writeFileSync(join(dir, 'AndroidManifest.xml'), `<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="${p.meta.packageId}"><application /></manifest>`);
        const run = (cmd: string, args: string[]) => {
          try { execFileSync(cmd, args, { stdio: 'pipe' }); } catch (e) {
            const err = e as { stderr?: Buffer; stdout?: Buffer };
            throw new Error(`${cmd} failed:\n${err.stderr?.toString() ?? ''}${err.stdout?.toString() ?? ''}`);
          }
        };
        run(sdk!.aapt2, ['compile', '--dir', res, '-o', join(dir, 'res.zip')]);
        mkdirSync(join(dir, 'gen'));
        run(sdk!.aapt2, ['link', '-I', sdk!.androidJar, '--manifest', join(dir, 'AndroidManifest.xml'), '--java', join(dir, 'gen'), '-o', join(dir, 'out.apk'), join(dir, 'res.zip')]);
        const sources = [...listFiles(join(dir, 'gen'), '.java'), ...listFiles(join(dir, 'app/src/main/java'), '.java')];
        mkdirSync(join(dir, 'classes'));
        run('javac', ['-nowarn', '-encoding', 'UTF-8', '-cp', sdk!.androidJar, '-d', join(dir, 'classes'), ...sources]);
        expect(sources.length).toBeGreaterThan(3);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    }, 60_000);
  }
});
