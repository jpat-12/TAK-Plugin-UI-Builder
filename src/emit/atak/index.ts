// ATAK emitter entry: Project → files under scaffold/atak/, laid out like an ATAK plugin
// module (app/src/main/...) so they can be copied straight into a template.

import type { Project } from '../../spec/types';
import { HEADER_NOTE, shortName, type FileMap } from '../common';
import { actionsJava, buildModel, pluginStateJava, screenViewsJava } from './java';
import { pascalScreen, planScreen, prefsXml, resourcesXml, type ResSink } from './layout';

export function emitAtak(p: Project): FileMap {
  const prefix = shortName(p);
  const res: ResSink = { prefix, strings: new Map(), arrays: new Map() };
  const model = buildModel(p);
  const javaDir = `app/src/main/java/${model.pkg.replace(/\./g, '/')}`;
  const files: FileMap = {};
  const screens: string[] = [];

  for (const s of p.screens) {
    if (s.surface === 'settings') {
      const name = `${prefix}_prefs_${s.id.replace(/[^a-zA-Z0-9]+/g, '_').toLowerCase()}`;
      files[`app/src/main/res/xml/${name}.xml`] = prefsXml(p, s, res, (k) => `${p.meta.packageId}.${k}`);
      screens.push(`- **${s.title}** (settings) → \`res/xml/${name}.xml\`: register it as the plugin's ATAK settings screen; its keys match \`PluginState.load()\`.`);
      continue;
    }
    const plan = planScreen(p, s, res);
    const cls = `${pascalScreen(s)}Views`;
    files[`app/src/main/res/layout/${plan.layout}.xml`] = plan.xml;
    for (const r of plan.rows) files[`app/src/main/res/layout/${r.name}.xml`] = r.xml;
    files[`${javaDir}/${cls}.java`] = screenViewsJava(p, model, plan, cls);
    screens.push(`- **${s.title}** (${s.surface}) → \`R.layout.${plan.layout}\` + \`${cls}\`${p.entry.openScreen === s.id ? ' (opened by the toolbar tool)' : ''}`);
  }

  files[`${javaDir}/PluginState.java`] = pluginStateJava(p, model);
  files[`${javaDir}/Actions.java`] = actionsJava(p, model);
  files[`app/src/main/res/values/${prefix}_strings.xml`] = resourcesXml(res);
  files[`app/src/main/res/values/${prefix}_colors.xml`] = [
    '<?xml version="1.0" encoding="utf-8"?>', '<resources>',
    `    <color name="${prefix}_accent">#33B5E5</color>`,
    `    <color name="${prefix}_primary">#2C5F73</color>`,
    `    <color name="${prefix}_danger">#C62828</color>`,
    `    <color name="${prefix}_muted">#A8A8A8</color>`,
    `    <color name="${prefix}_divider">#3A3A3A</color>`,
    '</resources>', ''].join('\n');
  files[`app/src/main/res/drawable/${prefix}_badge.xml`] = [
    '<?xml version="1.0" encoding="utf-8"?>', '<!-- Status badge pill; the Views class tints it per option color. -->',
    '<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">',
    '    <solid android:color="#6B7280" />', '    <corners android:radius="10dp" />', '</shape>', ''].join('\n');
  files[`app/src/main/res/drawable/${prefix}_section_bg.xml`] = [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">',
    '    <solid android:color="#262626" />', '    <stroke android:width="1dp" android:color="#3A3A3A" />', '    <corners android:radius="3dp" />', '</shape>', ''].join('\n');

  files['SCAFFOLD.md'] = [
    `# ATAK scaffold: ${p.meta.name}`, '', HEADER_NOTE, '',
    'Copy `app/` over the plugin template\'s `app/` (nothing here overwrites template files: every resource is prefixed',
    `\`${prefix}_\` and the Java lives in \`${model.pkg}\`). Then:`, '',
    '1. **Package:** the Java imports `' + p.meta.packageId + '.R`. If the template\'s namespace differs, change that import (or the namespace).',
    '2. **State + actions:** create one `PluginState` (call `load(prefs)` on start, `save(editor)` on change) and one `Actions` implementation,',
    '   usually in the drop-down receiver. Each `Actions` method\'s Javadoc is the designer\'s description: implement exactly that.',
    '3. **Screens:** inflate each layout with `PluginLayoutInflater.inflate(pluginContext, R.layout.…, null)` (not `LayoutInflater`, which',
    '   resolves ATAK\'s resources) and wrap it: `new XViews(root, state, actions)`. Call `views.render()` after changing state elsewhere.',
    '4. **Approximations** are marked in the XML with a comment ("no stock ATAK widget"). Refine them to match the mockups.', '',
    '## Screens', '', ...screens, '',
    '## Verified', '',
    'The builder\'s test suite compiles this scaffold for its sample projects with `aapt2` + `javac` against `android.jar`',
    '(no ATAK SDK needed), so the files are syntactically valid Android. Wiring into ATAK still needs the SDK.', '',
  ].join('\n');
  return files;
}
