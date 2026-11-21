import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CONTAINERS, ELEMENTS } from '../src/spec/catalog';
import { hasErrors, loadProject } from '../src/spec/load';
import type { Project } from '../src/spec/types';

const fixture = (name: string) => JSON.parse(readFileSync(`test/fixtures/${name}`, 'utf8')) as Project;

/** Load a mutated copy of a fixture and return its issue messages */
function issuesAfter(name: string, mutate: (p: Project) => void) {
  const p = structuredClone(fixture(name));
  mutate(p);
  const r = loadProject(p);
  return r.issues;
}
const messages = (issues: { message: string }[]) => issues.map((i) => i.message).join('\n');

describe('fixtures', () => {
  for (const name of ['hello-status.takui.json', 'event-cad.takui.json']) {
    it(`${name} loads with no errors or warnings`, () => {
      const r = loadProject(fixture(name));
      expect(r.ok).toBe(true);
      expect(r.issues).toEqual([]);
    });
  }
});

describe('load', () => {
  it('rejects non-JSON text in plain language', () => {
    const r = loadProject('{nope');
    expect(r.ok).toBe(false);
    expect(r.issues[0]?.message).toMatch(/isn't valid JSON/);
  });

  it('rejects unknown spec versions instead of guessing', () => {
    const r = loadProject({ ...fixture('hello-status.takui.json'), spec: 'takui/v0' });
    expect(r.ok).toBe(false);
    expect(messages(r.issues)).toMatch(/Unknown project format "takui\/v0"/);
  });

  it('shape errors point at the field', () => {
    const r = loadProject({ ...fixture('hello-status.takui.json'), meta: { ...fixture('hello-status.takui.json').meta, packageId: 'Not A Package' } });
    expect(r.ok).toBe(false);
    expect(r.issues[0]?.path).toBe('/meta/packageId');
  });

  it('a target is required', () => {
    const r = loadProject({ ...fixture('hello-status.takui.json'), meta: { ...fixture('hello-status.takui.json').meta, targets: [] } });
    expect(r.ok).toBe(false);
  });
});

describe('semantic rules', () => {
  const root = (p: Project) => p.screens[0]!.root;

  it('bind to a missing field is an error', () => {
    const is = issuesAfter('hello-status.takui.json', (p) => { root(p).children[3]!.bind = 'nope'; });
    expect(hasErrors(is)).toBe(true);
    expect(messages(is)).toMatch(/connected to "nope", which isn't a data field/);
  });

  it('bind type must match the component', () => {
    // text-input bound to an enum
    const is = issuesAfter('hello-status.takui.json', (p) => { root(p).children[4]!.bind = 'myStatus'; });
    expect(messages(is)).toMatch(/Text box "note-input" can't show "myStatus" \(type: enum\)/);
  });

  it('unknown event and missing action are both errors', () => {
    const is = issuesAfter('hello-status.takui.json', (p) => { root(p).children[5]!.on = { hover: 'ghost' }; });
    expect(messages(is)).toMatch(/doesn't have a "hover" event/);
    expect(messages(is)).toMatch(/runs action "ghost", which doesn't exist/);
  });

  it('unused actions are a warning, not an error', () => {
    const is = issuesAfter('hello-status.takui.json', (p) => { delete root(p).children[5]!.on; });
    expect(hasErrors(is)).toBe(false);
    expect(messages(is)).toMatch(/isn't triggered by anything yet/);
  });

  it('required props are enforced', () => {
    const is = issuesAfter('hello-status.takui.json', (p) => { root(p).children[5]!.props = {}; });
    expect(messages(is)).toMatch(/Button "send" needs a text/);
  });

  it('prop types are enforced, including target overrides', () => {
    const is = issuesAfter('hello-status.takui.json', (p) => {
      root(p).children[2]!.props = { size: 'huge' };
      root(p).children[5]!.targetOverrides = { atak: { props: { fullWidth: 'yes' } } };
    });
    expect(messages(is)).toMatch(/"Size" should be one of: small, large/);
    expect(messages(is)).toMatch(/\(atak override\): "Full width" should be on\/off/);
  });

  it('duplicate node ids are caught across screens', () => {
    const is = issuesAfter('event-cad.takui.json', (p) => { p.screens[1]!.root.id = 'main-tabs'; });
    expect(messages(is)).toMatch(/Two components share the id "main-tabs"/);
  });

  it('$item binds only work inside a repeating list, and must name an item field', () => {
    const outside = issuesAfter('hello-status.takui.json', (p) => { root(p).children[1]!.bind = '$item.unit'; });
    expect(messages(outside)).toMatch(/isn't inside a repeating list/);

    const wrongField = issuesAfter('event-cad.takui.json', (p) => {
      const list = (root(p).children[0] as any).children[1];
      list.children[0].children[1].bind = '$item.nope';
    });
    expect(messages(wrongField)).toMatch(/connected to "\$item.nope"/);
  });

  it('tabs must be titled containers', () => {
    const is = issuesAfter('event-cad.takui.json', (p) => { delete root(p).children[0]!.props.title; });
    expect(messages(is)).toMatch(/Each tab in "main-tabs" must be a Section/);
  });

  it('navigate actions and the entry point must target real screens', () => {
    const is = issuesAfter('event-cad.takui.json', (p) => {
      p.actions[1]!.params = { screen: 'gone' };
      p.entry.openScreen = 'also-gone';
    });
    expect(messages(is)).toMatch(/params.screen \("gone"\) isn't a screen/);
    expect(messages(is)).toMatch(/launch button opens "also-gone"/);
  });

  it('enum defaults must be one of the options', () => {
    const is = issuesAfter('hello-status.takui.json', (p) => { p.state[0]!.default = 'asleep'; });
    expect(messages(is)).toMatch(/Default "asleep" for "myStatus" isn't one of its options/);
  });

  it('visibleWhen must reference a field and give a value for eq/neq', () => {
    const is = issuesAfter('hello-status.takui.json', (p) => { root(p).children[0]!.visibleWhen = { key: 'myStatus', op: 'eq' }; });
    expect(messages(is)).toMatch(/gives no value to compare against/);
  });
});

describe('catalog', () => {
  it('every required/enum default is internally consistent', () => {
    for (const [type, spec] of Object.entries({ ...CONTAINERS, ...ELEMENTS })) {
      for (const [name, ps] of Object.entries(spec.props)) {
        if (ps.kind === 'enum' && ps.default !== undefined) expect(ps.options, `${type}.${name}`).toContain(ps.default);
      }
      if (spec.events?.length === 0) throw new Error(`${type}: empty events array — omit it instead`);
    }
  });

  it('every component has a verified support level on every platform (TAKX verified from its 5.8.0 SDK)', () => {
    for (const spec of Object.values({ ...CONTAINERS, ...ELEMENTS })) for (const s of Object.values(spec.support)) expect(s).not.toBe('unverified');
  });

  it('marking TAKX-approximate components did not leak into components sharing the default support table', () => {
    expect(ELEMENTS.button!.support.takx).toBe('native');
    expect(ELEMENTS['status-badge']!.support.takx).toBe('approx');
    expect(CONTAINERS.stack.support.takx).toBe('native');
  });
});
