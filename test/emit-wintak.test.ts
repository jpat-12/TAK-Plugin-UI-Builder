// Builds every template's WinTAK scaffold as one WPF library (dotnet, LangVersion 7.3 to match
// WinTAK's .NET Framework toolchain), and checks every {Binding} path names a generated
// property: WPF only reports broken binding paths at runtime, so the build alone can't.

import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { emitWintak } from '../src/emit/wintak';
import { loadProject } from '../src/spec/load';
import type { Project } from '../src/spec/types';
import { TEMPLATES } from '../src/templates';

const ROOT = join('.emit-tmp', 'wintak');
let dotnet = false;
try { execFileSync('dotnet', ['--version'], { stdio: 'pipe' }); dotnet = true; } catch { /* no .NET SDK: skip the build */ }
const isWindows = process.platform === 'win32';

const projects: Project[] = TEMPLATES.map((t) => {
  const r = loadProject(t.raw);
  if (!r.ok) throw new Error('bad template');
  return r.project;
});

describe('WinTAK scaffold', () => {
  it('every {Binding} path exists on the view model or an item class', () => {
    for (const p of projects) {
      const files = emitWintak(p);
      const cs = files['ViewModels/PluginViewModel.cs']!;
      const props = new Set([...cs.matchAll(/public [\w<>?.]+ (\w+) \{/g)].map((m) => m[1]!));
      for (const [path, body] of Object.entries(files)) {
        if (!path.endsWith('.xaml')) continue;
        for (const m of body.matchAll(/\{Binding (?:DataContext\.)?([A-Za-z_][\w]*)/g)) {
          expect(props.has(m[1]!), `${p.meta.name} ${path}: {Binding ${m[1]}} has no matching property`).toBe(true);
        }
      }
    }
  });

  it.skipIf(!dotnet || !isWindows)(`builds as WPF with LangVersion 7.3${dotnet && isWindows ? '' : ' (SKIPPED: needs Windows + .NET SDK)'}`, () => {
    rmSync(ROOT, { recursive: true, force: true });
    projects.forEach((p, i) => {
      for (const [path, body] of Object.entries(emitWintak(p))) {
        if (path.endsWith('.md')) continue;
        const full = join(ROOT, `t${i}`, path);
        mkdirSync(dirname(full), { recursive: true });
        writeFileSync(full, body);
      }
    });
    writeFileSync(join(ROOT, 'Scaffolds.csproj'), [
      '<Project Sdk="Microsoft.NET.Sdk">', '  <PropertyGroup>',
      '    <TargetFramework>net8.0-windows</TargetFramework>', '    <UseWPF>true</UseWPF>', '    <OutputType>Library</OutputType>',
      '    <LangVersion>7.3</LangVersion>', '    <Nullable>disable</Nullable>', '    <TreatWarningsAsErrors>false</TreatWarningsAsErrors>',
      '    <ImplicitUsings>disable</ImplicitUsings>', '  </PropertyGroup>', '</Project>', ''].join('\n'));
    let output = '';
    let ok = true;
    try {
      output = execFileSync('dotnet', ['build', join(ROOT, 'Scaffolds.csproj'), '-nologo', '-v', 'q', '-clp:ErrorsOnly'], { stdio: 'pipe' }).toString();
    } catch (e) {
      ok = false;
      const err = e as { stdout?: Buffer; stderr?: Buffer };
      output = (err.stdout?.toString() ?? '') + (err.stderr?.toString() ?? '');
    }
    expect(ok, output.split('\n').filter((l) => /error/i.test(l)).slice(0, 15).join('\n')).toBe(true);
  }, 240_000);
});
