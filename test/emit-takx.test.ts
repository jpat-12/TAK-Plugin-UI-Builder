// Compiles every template's TAKX scaffold with `javac --release 17` (TAKX's Java level).
// Panels, state and actions need only the JDK (Swing). The *Plugin class compiles against stubs
// of the TAKX API types it uses. The stubs below are transcribed from the TAKX 5.8.0 SDK Javadoc
// (deployment-5.8.0-javadoc.jar), signature for signature, so a wrong method name, parameter
// type or missing required annotation element fails here. Skips without a JDK.

import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { emitTakx } from '../src/emit/takx';
import { loadProject } from '../src/spec/load';
import { TEMPLATES } from '../src/templates';

const ROOT = join('.emit-tmp', 'takx');
let javac = false;
try { execFileSync('javac', ['-version'], { stdio: 'pipe' }); javac = true; } catch { /* no JDK: skip */ }

/** TAKX 5.8.0 API surface used by the generated plugin class, per the SDK Javadoc */
const STUBS: Record<string, string> = {
  'gov/takx/api/annotation/InvokeOnEDT.java': 'package gov.takx.api.annotation;\nimport java.lang.annotation.*;\n@Retention(RetentionPolicy.RUNTIME) @Target(ElementType.METHOD)\npublic @interface InvokeOnEDT {}\n',
  // required: family, type, version, iconPath; optional: exportControlled (minimumSupportedVersion omitted: unused)
  'gov/takx/api/plugin/annotations/PluginSpecification.java': 'package gov.takx.api.plugin.annotations;\npublic @interface PluginSpecification { String family(); String type(); String version(); String iconPath(); boolean exportControlled() default false; }\n',
  // required: name; optional: description, longDescription, vendor, copyright
  'gov/takx/api/plugin/annotations/PluginDescriptor.java': 'package gov.takx.api.plugin.annotations;\npublic @interface PluginDescriptor { String name(); String description() default ""; String longDescription() default ""; String vendor() default ""; String copyright() default ""; }\n',
  // required: spec, descriptor (canRunHeadless deprecated for removal: deliberately absent, so using it fails)
  'gov/takx/api/plugin/annotations/AppPlugin.java': 'package gov.takx.api.plugin.annotations;\nimport java.lang.annotation.*;\n@Retention(RetentionPolicy.RUNTIME) @Target(ElementType.TYPE)\npublic @interface AppPlugin { PluginSpecification spec(); PluginDescriptor descriptor(); }\n',
  'gov/takx/api/plugin/app/IAppPlugin.java': 'package gov.takx.api.plugin.app;\npublic interface IAppPlugin { void start(); void stop(); void shutdown(); void setAppDelegate(IAppPluginDelegate delegate); String displayWarningOnStop(); }\n',
  'gov/takx/api/plugin/app/AAppPlugin.java': 'package gov.takx.api.plugin.app;\npublic abstract class AAppPlugin implements IAppPlugin {\n  protected IAppPluginDelegate delegate;\n  protected AAppPlugin() {}\n  public void setAppDelegate(IAppPluginDelegate delegate) { this.delegate = delegate; }\n  protected void onDelegateInjected() {}\n  public String store() { return null; }\n  public void restore(String s) {}\n  public String displayWarningOnStop() { return null; }\n}\n',
  'gov/takx/api/plugin/app/IAppPluginDelegate.java': 'package gov.takx.api.plugin.app;\npublic interface IAppPluginDelegate { gov.takx.api.ui.IUISpaceManager getUISpaceManager(); }\n',
  'gov/takx/api/ui/ComponentPosition.java': 'package gov.takx.api.ui;\npublic enum ComponentPosition { LEFT, RIGHT, BOTTOM, CENTER, GLOBE }\n',
  'gov/takx/api/ui/IUISpaceManager.java': 'package gov.takx.api.ui;\nimport java.awt.Component;\nimport gov.takx.platform.ui.ComponentDescriptor;\npublic interface IUISpaceManager { void addComponent(ComponentDescriptor d, Component c); void showComponent(Component c); void hideComponent(Component c); void toggleComponent(Component c); void removeComponent(Component c); }\n',
  'gov/takx/platform/ui/ComponentDescriptor.java': 'package gov.takx.platform.ui;\npublic class ComponentDescriptor {}\n',
  'gov/takx/platform/ui/ComponentDescriptorBuilder.java': 'package gov.takx.platform.ui;\nimport java.awt.Component;\nimport java.net.URL;\nimport gov.takx.api.ui.ComponentPosition;\npublic class ComponentDescriptorBuilder {\n  public ComponentDescriptorBuilder(Class<?> c, String title) {}\n  public ComponentDescriptorBuilder(Component c, String title) {}\n  public ComponentDescriptorBuilder setIcon(URL u) { return this; }\n  public ComponentDescriptorBuilder setComponentPosition(ComponentPosition p) { return this; }\n  public ComponentDescriptorBuilder setToolbarButtonVisible(boolean b) { return this; }\n  public ComponentDescriptorBuilder setTooltipText(String s) { return this; }\n  public ComponentDescriptorBuilder setCloseable(boolean b) { return this; }\n  public ComponentDescriptor build() { return new ComponentDescriptor(); }\n}\n',
};

const projects = TEMPLATES.map((t) => {
  const r = loadProject(t.raw);
  if (!r.ok) throw new Error('bad template');
  return r.project;
});

function listJava(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? listJava(join(dir, e.name)) : e.name.endsWith('.java') ? [join(dir, e.name)] : []));
}

describe('TAKX scaffold', () => {
  it('follows the SDK app-plugin shape', () => {
    const files = emitTakx(projects.find((p) => p.meta.packageId === 'org.example.statusboard')!);
    const plugin = files['src/main/java/org/example/statusboard/TeamStatusBoardPlugin.java']!;
    expect(plugin).toContain('@AppPlugin(');
    expect(plugin).toContain('extends AAppPlugin');
    expect(plugin).toContain('delegate.getUISpaceManager()');
    expect(plugin).toContain('@InvokeOnEDT');
    expect(plugin).not.toContain('canRunHeadless'); // deprecated for removal in 5.7+
    expect(files['src/main/java/org/example/statusboard/ui/PluginState.java']).toContain('import java.util.prefs.Preferences;');
    expect(files['src/main/java/org/example/statusboard/ui/BoardPanel.java']).toContain('extends JPanel');
  });

  it.skipIf(!javac)(`every template compiles with javac --release 17${javac ? '' : ' (SKIPPED: no JDK)'}`, () => {
    rmSync(ROOT, { recursive: true, force: true });
    for (const [path, body] of Object.entries(STUBS)) {
      mkdirSync(dirname(join(ROOT, 'stubs', path)), { recursive: true });
      writeFileSync(join(ROOT, 'stubs', path), body);
    }
    projects.forEach((p, i) => {
      for (const [path, body] of Object.entries(emitTakx(p))) {
        if (!path.endsWith('.java')) continue;
        mkdirSync(dirname(join(ROOT, `t${i}`, path)), { recursive: true });
        writeFileSync(join(ROOT, `t${i}`, path), body);
      }
    });
    const sources = listJava(ROOT);
    mkdirSync(join(ROOT, 'classes'), { recursive: true });
    let out = '';
    try {
      execFileSync('javac', ['--release', '17', '-nowarn', '-encoding', 'UTF-8', '-d', join(ROOT, 'classes'), ...sources], { stdio: 'pipe' });
    } catch (e) {
      const err = e as { stderr?: Buffer; stdout?: Buffer };
      out = (err.stderr?.toString() ?? '') + (err.stdout?.toString() ?? '');
    }
    expect(out.split('\n').filter((l) => /error/.test(l)).slice(0, 12).join('\n')).toBe('');
    expect(sources.length).toBeGreaterThan(40);
  }, 120_000);
});
