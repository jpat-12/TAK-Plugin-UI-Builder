import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import { DraftError, MODEL, requestDraft } from '../src/ai/client';
import { catalogDigest, DRAFT_JSON_SCHEMA, draftToNodes, parseDraft, type Draft } from '../src/ai/draft';
import { CONTAINERS, ELEMENTS } from '../src/spec/catalog';
import { newProject } from '../src/spec/factory';
import { locate, walk } from '../src/spec/tree';
import type { Project } from '../src/spec/types';
import { useProject } from '../src/store/project';

const N = (id: string, parent: string, type: string, text = '', extra: Partial<Draft['nodes'][number]> = {}): Draft['nodes'][number] =>
  ({ id, parent, type, text, props: [], bind: '', event: '', action: '', ...extra });

/** A deliberately messy draft: everything draftToNodes must repair or report */
const MESSY: Draft = {
  title: 'Hazard Report',
  notes: 'Assumed hazards are reported to the whole team.',
  newFields: [
    { key: 'hazardType', label: 'Hazard type', type: 'enum', persisted: false, options: [{ value: 'Fire', label: 'Fire', color: '#dc2626' }, { value: 'flood', label: 'Flood', color: 'blue' }, { value: 'fire', label: 'dup', color: '' }], itemFields: [] },
    { key: 'note', label: 'Note', type: 'string', persisted: false, options: [], itemFields: [] }, // existing string field: reused
    { key: 'myStatus', label: 'Clash', type: 'number', persisted: false, options: [], itemFields: [] }, // existing enum: renamed
    { key: 'reports', label: 'Reports', type: 'list', persisted: false, options: [], itemFields: [{ key: 'what', type: 'string', options: [] }, { key: 'sev', type: 'enum', options: [{ value: 'high', label: 'High', color: '#ff0000' }] }] },
  ],
  newActions: [
    { id: 'send', label: 'Send report', kind: 'cot-send', intent: 'Drop a hazard marker at the location and send it to the team.', screen: '' },
    { id: 'go', label: 'Open map', kind: 'navigate', intent: 'Open the map screen.', screen: 'does-not-exist' },
  ],
  nodes: [
    N('form', '', 'section', 'New report'),
    N('type', 'form', 'dropdown', 'Hazard type', { bind: 'hazardType' }),
    N('sev', 'form', 'slider', 'Severity', { props: [{ name: 'min', value: '1' }, { name: 'max', value: '5' }, { name: 'step', value: 'x' }, { name: 'bogus', value: '1' }] }),
    N('note', 'form', 'text-area', 'Notes', { bind: 'note', props: [{ name: 'rows', value: '4' }] }),
    N('clash', 'form', 'number-input', 'Count', { bind: 'myStatus' }),
    N('bad-bind', 'form', 'checkbox', 'Urgent', { bind: 'noSuchField' }),
    N('send', 'form', 'button', 'Send', { event: 'click', action: 'send', props: [{ name: 'fullWidth', value: 'true' }, { name: 'style', value: 'neon' }] }),
    N('send', 'form', 'button', 'Duplicate id', { event: 'hover', action: 'send' }),
    N('tabs', '', 'tabs'),
    N('stray', 'tabs', 'label', 'Loose text in tabs'),
    N('recent', 'tabs', 'section', 'Recent'),
    N('list', 'recent', 'list', '', { bind: 'reports' }),
    N('row-what', 'list', 'label', '', { bind: '$item.what' }),
    N('row-sev', 'list', 'status-badge', '', { bind: '$item.sev' }),
    N('orphan', 'nowhere', 'heading', 'Orphan'),
    N('under-element', 'type', 'label', 'Child of an element'),
    N('ghost', 'form', 'hologram' as string, 'Unknown'),
  ],
};

function baseProject(): Project {
  const p = newProject();
  p.state.push({ key: 'note', type: 'string' }, { key: 'myStatus', type: 'enum', options: [{ value: 'a', label: 'A' }] });
  p.screens[0]!.root.children.push({ id: 'send', kind: 'element', type: 'heading', props: { text: 'Taken id' } });
  return p;
}

describe('draft schema + prompt', () => {
  it('is strict and non-recursive, as structured outputs require', () => {
    const check = (s: Record<string, unknown>, path: string) => {
      if (s.type === 'object') {
        expect(s.additionalProperties, path).toBe(false);
        expect([...(s.required as string[])].sort(), path).toEqual(Object.keys(s.properties as object).sort());
        for (const [k, v] of Object.entries(s.properties as Record<string, Record<string, unknown>>)) check(v, `${path}.${k}`);
      }
      if (s.type === 'array') check(s.items as Record<string, unknown>, `${path}[]`);
      expect(JSON.stringify(s)).not.toContain('$ref');
    };
    check(DRAFT_JSON_SCHEMA as Record<string, unknown>, 'draft');
  });
  it('the catalog digest documents every component type', () => {
    const d = catalogDigest();
    for (const t of [...Object.keys(CONTAINERS), ...Object.keys(ELEMENTS)]) expect(d).toContain(`- ${t}:`);
  });
});

describe('draftToNodes', () => {
  const p = baseProject();
  const r = draftToNodes(MESSY, p);
  const all = [...walk(r.root)];
  const byText = (t: string) => all.find((n) => n.props.text === t || n.props.label === t || n.props.title === t);

  it('reuses same-type fields, renames clashes, normalizes options', () => {
    expect(r.newFields.map((f) => f.key)).toEqual(['hazardType', 'myStatus2', 'reports']);
    expect(r.newFields[0]!.options).toEqual([{ value: 'fire', label: 'Fire', color: '#DC2626' }, { value: 'flood', label: 'Flood' }]);
    expect(byText('Notes')!.bind).toBe('note');
    expect(byText('Count')!.bind).toBe('myStatus2');
  });
  it('coerces props to catalog types and drops invalid ones', () => {
    expect(byText('Severity')!.props).toEqual({ label: 'Severity', min: 1, max: 5 });
    expect(byText('Notes')!.props.rows).toBe(4);
    const send = all.find((n) => n.props.text === 'Send')!;
    expect(send.props).toEqual({ text: 'Send', fullWidth: true });
    expect(send.on).toEqual({ click: 'send' }); // the NODE id "send" clashed (renamed); the action id didn't
  });
  it('makes ids unique against the project and each other', () => {
    const ids = all.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).not.toContain('send'); // taken by the existing heading
  });
  it('repairs structure and reports what it changed', () => {
    const tabs = all.find((n) => n.type === 'tabs')!;
    expect(tabs.kind === 'container' && tabs.children.every((c) => c.kind === 'container' && c.props.title)).toBe(true);
    expect(r.root.children.some((c) => c.props.text === 'Orphan')).toBe(true);
    expect(r.notes.join('\n')).toMatch(/Assumed hazards/);
    expect(r.notes.join('\n')).toMatch(/unknown component type "hologram"/);
    expect(r.notes.join('\n')).toMatch(/couldn't connect to "noSuchField"/);
    expect(r.notes.join('\n')).toMatch(/no "hover" event/);
    expect(r.notes.join('\n')).toMatch(/opened a screen that doesn't exist/);
    expect(r.newActions.find((a) => a.label === 'Open map')!.kind).toBe('custom');
  });
  it('inserted into a project, the result validates with no errors (one undo step)', () => {
    setActivePinia(createPinia());
    const s = useProject();
    s.replaceProject(baseProject());
    s.applyDraft(draftToNodes(MESSY, s.project), 'new-screen');
    expect(s.issues.filter((i) => i.severity === 'error')).toEqual([]);
    expect(s.project.screens.map((x) => x.id)).toEqual(['main', 'hazard-report']);
    expect(s.screen.id).toBe('hazard-report');
    s.undo();
    expect(s.project.screens).toHaveLength(1);
    expect(s.project.state.map((f) => f.key)).toEqual(['note', 'myStatus']);
  });
  it('insert mode adds the drafted components at the selection', () => {
    setActivePinia(createPinia());
    const s = useProject();
    s.replaceProject(baseProject());
    s.select('send');
    s.applyDraft(draftToNodes({ ...MESSY, nodes: [N('h', '', 'heading', 'Inserted')] }, s.project), 'insert');
    expect(s.screen.root.children.map((c) => c.props.text)).toEqual(['Taken id', 'Inserted']);
    expect(locate(s.project, s.selectedId!)!.node.props.text).toBe('Inserted');
  });
});

describe('parseDraft', () => {
  it('rejects non-JSON and wrong shapes in plain language', () => {
    expect(() => parseDraft('not json')).toThrow(/wasn't valid JSON/);
    expect(() => parseDraft('{"title": 1}')).toThrow(/didn't match the expected shape/);
    expect(parseDraft(JSON.stringify(MESSY)).title).toBe('Hazard Report');
  });
});

describe('requestDraft (mocked fetch: no tokens spent)', () => {
  const ok = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  const message = (text: string, stop_reason = 'end_turn') => ({
    id: 'msg_test', type: 'message', role: 'assistant', model: MODEL, content: [{ type: 'text', text }],
    stop_reason, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 10 },
  });
  let seen: { url: string; headers: Headers; body: Record<string, unknown> } | undefined;
  const fake = (res: () => Response): typeof fetch => (async (url: RequestInfo | URL, init?: RequestInit) => {
    seen = { url: String(url), headers: new Headers(init?.headers), body: JSON.parse(String(init?.body)) };
    return res();
  }) as typeof fetch;
  beforeEach(() => { seen = undefined; });

  it('sends the right request and returns the parsed draft', async () => {
    const d = await requestDraft('sk-ant-test', 'a hazard form', newProject(), { fetch: fake(() => ok(message(JSON.stringify(MESSY)))) });
    expect(d.title).toBe('Hazard Report');
    expect(seen!.url).toMatch(/\/v1\/messages\?beta=true$/);
    // SDK 1.x sends the key as `authorization` (older SDKs used x-api-key): accept either
    expect(`${seen!.headers.get('authorization') ?? ''} ${seen!.headers.get('x-api-key') ?? ''}`).toContain('sk-ant-test');
    expect(seen!.headers.get('anthropic-dangerous-direct-browser-access')).toBe('true');
    expect(seen!.headers.get('anthropic-beta')).toContain('server-side-fallback-2026-07-01');
    expect(seen!.body.model).toBe('claude-opus-5-5');
    expect(seen!.body.fallbacks).toBe('default');
    expect(seen!.body.output_config).toMatchObject({ effort: 'medium', format: { type: 'json_schema' } });
    expect(seen!.body).not.toHaveProperty('thinking'); // Opus 5.5: adaptive by default; disabling is a 400
    expect(seen!.body).not.toHaveProperty('tool_choice'); // forced tool use is a 400 on Opus 5.5
    expect(String((seen!.body.messages as { content: string }[])[0]!.content)).toContain('a hazard form');
  });
  it('turns refusals, truncation, bad keys and bad JSON into plain messages', async () => {
    const p = newProject();
    await expect(requestDraft('k', 'x', p, { fetch: fake(() => ok(message('', 'refusal'))) })).rejects.toThrow(/declined/);
    await expect(requestDraft('k', 'x', p, { fetch: fake(() => ok(message('{"title"', 'max_tokens'))) })).rejects.toThrow(/cut off/);
    await expect(requestDraft('k', 'x', p, { fetch: fake(() => ok({ type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } }, 401)) })).rejects.toThrow(/key was rejected/);
    await expect(requestDraft('k', 'x', p, { fetch: fake(() => ok(message('nope'))) })).rejects.toBeInstanceOf(DraftError);
  });
});
