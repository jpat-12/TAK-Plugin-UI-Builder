// The one store (PLAN.md §2). `project` is the only editable record; every change goes
// through mutate() so undo/redo and autosave see all of them uniformly. Components read the
// project and call these mutators. They never splice project arrays themselves.

import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';
import { cloneWithNewIds, createNode, newProject, uniqueId } from '../spec/factory';
import { loadProject } from '../spec/load';
import { projectSchema } from '../spec/schema';
import { allNodeIds, contains, fieldAt, locate, resolveKey, walk, walkWithAncestors } from '../spec/tree';
import type { Action, Banner, ContainerType, Node, Project, PropValue, Screen, StateField, Surface, Target, Theme, VisibleWhen } from '../spec/types';

const IDENT = /^[a-zA-Z][a-zA-Z0-9_]*$/;
import { validateProject, type Issue } from '../spec/validate';
import type { DraftResult } from '../ai/draft';
import { dictionary } from '../spell/dictionary';
import { collectText, setText } from '../spell/text';
import { findMisspellings, replaceWord, type Misspelling } from '../spell/words';
import { CHANNEL, storageKeyFor } from '../app/channel';

/** Versioned key: on a breaking spec change, bump instead of migrating stale browser copies.
 *  The dev preview uses its own key (app/channel.ts) so it never touches live autosaves. */
export const STORAGE_KEY = storageKeyFor(CHANNEL);
const UNDO_LIMIT = 100;
/** Edits with the same coalesce key inside this window share one undo step (typing) */
const COALESCE_MS = 1000;

export const useProject = defineStore('project', () => {
  const restored = restore();
  const project = ref<Project>(restored.project);
  /** Set when localStorage held something unreadable; the raw copy is kept under STORAGE_KEY:recovered */
  const restoreNote = ref(restored.note);

  const screenId = ref(project.value.screens[0]!.id);
  const selectedId = ref<string | null>(null);

  const undoStack = ref<string[]>([]);
  const redoStack = ref<string[]>([]);
  let lastKey = '';
  let lastAt = 0;

  // ---- derived ----
  const screen = computed<Screen>(() => project.value.screens.find((s) => s.id === screenId.value) ?? project.value.screens[0]!);
  const selected = computed(() => (selectedId.value ? locate(project.value, selectedId.value) : undefined));
  /** Shape issues are a safety net. The inspector shouldn't let bad formats through, but if it does, say so. */
  const issues = computed<Issue[]>(() => {
    const shape = projectSchema.safeParse(project.value);
    const shapeIssues: Issue[] = shape.success ? [] : shape.error.issues.map((z) => ({ severity: 'error', path: '/' + z.path.join('/'), message: `/${z.path.join('/')}: ${z.message}` }));
    return [...shapeIssues, ...validateProject(project.value)];
  });
  const issuesByRef = computed(() => {
    const m = new Map<string, Issue[]>();
    for (const i of issues.value) if (i.ref) m.set(i.ref, [...(m.get(i.ref) ?? []), i]);
    return m;
  });

  /** Empty until the dictionary loads (and always in tests): spelling never blocks anything */
  const spelling = computed<Misspelling[]>(() => {
    const d = dictionary.value;
    if (!d) return [];
    return findMisspellings(collectText(project.value), (w) => d.check(w), project.value.meta.spellingAllow ?? []);
  });

  // ---- core ----
  function mutate(fn: (p: Project) => void, coalesceKey = '') {
    const now = Date.now();
    if (!(coalesceKey && coalesceKey === lastKey && now - lastAt < COALESCE_MS)) {
      undoStack.value.push(JSON.stringify(project.value));
      if (undoStack.value.length > UNDO_LIMIT) undoStack.value.shift();
    }
    lastKey = coalesceKey;
    lastAt = now;
    redoStack.value = [];
    fn(project.value);
  }

  function swapTo(json: string) {
    project.value = JSON.parse(json) as Project;
    lastKey = '';
    if (!project.value.screens.some((s) => s.id === screenId.value)) screenId.value = project.value.screens[0]!.id;
    if (selectedId.value && !locate(project.value, selectedId.value)) selectedId.value = null;
  }
  function undo() {
    const prev = undoStack.value.pop();
    if (prev === undefined) return;
    redoStack.value.push(JSON.stringify(project.value));
    swapTo(prev);
  }
  function redo() {
    const next = redoStack.value.pop();
    if (next === undefined) return;
    undoStack.value.push(JSON.stringify(project.value));
    swapTo(next);
  }

  function replaceProject(p: Project) {
    // JSON round-trip, not structuredClone: callers may pass reactive proxies, which structuredClone rejects
    mutate(() => { project.value = JSON.parse(JSON.stringify(p)) as Project; });
    screenId.value = project.value.screens[0]!.id;
    selectedId.value = null;
  }

  // ---- selection ----
  function select(id: string | null) {
    selectedId.value = id;
    if (id) {
      const at = locate(project.value, id);
      if (at) screenId.value = at.screen.id;
    }
  }
  function selectScreen(id: string) {
    screenId.value = id;
    selectedId.value = null;
  }

  // ---- nodes ----
  const findContainer = (p: Project, id: string) => {
    const at = locate(p, id);
    return at?.node.kind === 'container' ? at.node : undefined;
  };

  function addNode(kind: 'container' | 'element', type: string, parentId: string, index: number): string | undefined {
    let newId: string | undefined;
    mutate((p) => {
      const parent = findContainer(p, parentId);
      if (!parent) return;
      const node = createNode(kind, type, allNodeIds(p));
      parent.children.splice(Math.min(index, parent.children.length), 0, node);
      newId = node.id;
    });
    if (newId) select(newId);
    return newId;
  }

  /** Where a click-to-add from the palette lands: into the selected container, else after the selected element */
  function insertionPoint(): { parentId: string; index: number } {
    const at = selected.value;
    if (!at || at.screen.id !== screen.value.id) return { parentId: screen.value.root.id, index: screen.value.root.children.length };
    if (at.node.kind === 'container' && at.node.type !== 'tabs') return { parentId: at.node.id, index: at.node.children.length };
    if (at.parent && at.parent.type !== 'tabs') return { parentId: at.parent.id, index: at.index + 1 };
    return { parentId: screen.value.root.id, index: screen.value.root.children.length };
  }

  function canMove(id: string, parentId: string): boolean {
    const at = locate(project.value, id);
    if (!at || !at.parent) return false; // screen roots don't move
    return !contains(at.node, parentId);
  }

  function moveNode(id: string, parentId: string, index: number) {
    if (!canMove(id, parentId)) return;
    mutate((p) => {
      const at = locate(p, id)!;
      const target = findContainer(p, parentId);
      if (!target || !at.parent) return;
      at.parent.children.splice(at.index, 1);
      // removing from earlier in the same list shifts the drop index left by one
      const i = at.parent === target && index > at.index ? index - 1 : index;
      target.children.splice(Math.min(i, target.children.length), 0, at.node);
    });
  }

  function removeNode(id: string) {
    const at = locate(project.value, id);
    if (!at?.parent) return;
    mutate((p) => {
      const here = locate(p, id)!;
      here.parent!.children.splice(here.index, 1);
    });
    if (selectedId.value && !locate(project.value, selectedId.value)) selectedId.value = at.parent.id;
  }

  function duplicateNode(id: string) {
    const at = locate(project.value, id);
    if (!at?.parent) return;
    let newId = '';
    mutate((p) => {
      const here = locate(p, id)!;
      const copy = cloneWithNewIds(here.node, allNodeIds(p));
      here.parent!.children.splice(here.index + 1, 0, copy);
      newId = copy.id;
    });
    select(newId);
  }

  // Keyboard/touch reordering: drag-and-drop needs a mouse, these don't.
  /** Swap with the previous (-1) or next (+1) sibling */
  function nudge(id: string, dir: -1 | 1) {
    const at = locate(project.value, id);
    if (!at?.parent) return;
    const j = at.index + dir;
    if (j < 0 || j >= at.parent.children.length) return;
    mutate((p) => {
      const here = locate(p, id)!;
      const kids = here.parent!.children;
      [kids[here.index], kids[j]] = [kids[j]!, kids[here.index]!];
    });
  }
  /** Can `id` move into its previous sibling (which must be a non-tabs container)? */
  function canIndent(id: string): boolean {
    const at = locate(project.value, id);
    const prev = at?.parent?.children[at.index - 1];
    return !!prev && prev.kind === 'container' && prev.type !== 'tabs';
  }
  function indent(id: string) {
    if (!canIndent(id)) return;
    const at = locate(project.value, id)!;
    const prev = at.parent!.children[at.index - 1] as Extract<Node, { kind: 'container' }>;
    moveNode(id, prev.id, prev.children.length);
  }
  /** Can `id` move out to sit right after its parent? Not out of a screen root, not into a tabs bar. */
  function canOutdent(id: string): boolean {
    const at = locate(project.value, id);
    const grand = at?.ancestors[at.ancestors.length - 2];
    return !!grand && grand.type !== 'tabs';
  }
  function outdent(id: string) {
    if (!canOutdent(id)) return;
    const at = locate(project.value, id)!;
    const grand = at.ancestors[at.ancestors.length - 2]!;
    moveNode(id, grand.id, grand.children.indexOf(at.parent!) + 1);
  }

  function editNode(id: string, fn: (n: Node) => void, coalesceKey = '') {
    mutate((p) => { const at = locate(p, id); if (at) fn(at.node); }, coalesceKey);
  }

  const setProp = (id: string, name: string, value: PropValue | undefined) =>
    editNode(id, (n) => { if (value === undefined) delete n.props[name]; else n.props[name] = value; }, `prop:${id}:${name}`);
  const setBind = (id: string, bind: string | undefined) =>
    editNode(id, (n) => { if (bind) n.bind = bind; else delete n.bind; });
  const setEvent = (id: string, ev: string, actionId: string | undefined) =>
    editNode(id, (n) => {
      const on = { ...(n.on ?? {}) };
      if (actionId) on[ev] = actionId; else delete on[ev];
      if (Object.keys(on).length) n.on = on; else delete n.on;
    });
  const setVisibleWhen = (id: string, v: VisibleWhen | undefined) =>
    editNode(id, (n) => { if (v) n.visibleWhen = v; else delete n.visibleWhen; }, `vis:${id}`);
  const setHiddenOn = (id: string, t: Target, hidden: boolean) =>
    editNode(id, (n) => {
      const o = { ...(n.targetOverrides ?? {}) };
      const cur = { ...(o[t] ?? {}) };
      if (hidden) cur.hidden = true; else delete cur.hidden;
      if (Object.keys(cur).length) o[t] = cur; else delete o[t];
      if (Object.keys(o).length) n.targetOverrides = o; else delete n.targetOverrides;
    });
  const setContainerType = (id: string, type: ContainerType) =>
    editNode(id, (n) => { if (n.kind === 'container') n.type = type; });

  /** Node ids aren't referenced by other parts of the spec, so a rename is local */
  function renameNode(id: string, next: string): boolean {
    if (id === next) return true;
    if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(next) || allNodeIds(project.value).has(next)) return false;
    editNode(id, (n) => { n.id = next; });
    if (selectedId.value === id) selectedId.value = next;
    return true;
  }

  function addTab(tabsId: string) {
    let newId = '';
    mutate((p) => {
      const tabs = findContainer(p, tabsId);
      if (!tabs) return;
      const tab = createNode('container', 'section', allNodeIds(p));
      tab.props.title = `Tab ${tabs.children.length + 1}`;
      tabs.children.push(tab);
      newId = tab.id;
    });
    if (newId) select(newId);
  }

  // ---- screens ----
  function addScreen(surface: Surface) {
    let id = '';
    mutate((p) => {
      const taken = new Set([...p.screens.map((s) => s.id), ...allNodeIds(p)]);
      id = uniqueId(surface === 'dialog' ? 'dialog' : surface === 'settings' ? 'settings' : 'screen', taken);
      const title = surface === 'dialog' ? 'New dialog' : surface === 'settings' ? 'Settings' : 'New screen';
      p.screens.push({ id, title, surface, root: { id: uniqueId(`${id}-root`, taken), kind: 'container', type: 'stack', props: { gap: 8 }, children: [] } });
    });
    selectScreen(id);
  }
  function removeScreen(id: string) {
    if (project.value.screens.length < 2) return;
    mutate((p) => { p.screens = p.screens.filter((s) => s.id !== id); });
    if (screenId.value === id) selectScreen(project.value.screens[0]!.id);
  }
  function updateScreen(id: string, patch: Partial<Pick<Screen, 'title' | 'surface'>>) {
    mutate((p) => { const s = p.screens.find((x) => x.id === id); if (s) Object.assign(s, patch); }, `screen:${id}:${Object.keys(patch).join()}`);
  }
  /** Screen ids ARE referenced (entry.openScreen, navigate actions), so rewrite those too */
  function renameScreen(id: string, next: string): boolean {
    if (id === next) return true;
    if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(next) || project.value.screens.some((s) => s.id === next)) return false;
    mutate((p) => {
      p.screens.find((s) => s.id === id)!.id = next;
      if (p.entry.openScreen === id) p.entry.openScreen = next;
      for (const a of p.actions) if (a.kind === 'navigate' && a.params?.screen === id) a.params.screen = next;
    });
    if (screenId.value === id) screenId.value = next;
    return true;
  }

  // ---- project-level ----
  /** Renaming the plugin also renames screen titles / the launch label that still echo the old name */
  const updateMeta = (patch: Partial<Project['meta']>) =>
    mutate((p) => {
      const old = p.meta.name;
      Object.assign(p.meta, patch);
      if (patch.name === undefined || patch.name === old) return;
      for (const s of p.screens) if (s.title === old) s.title = patch.name;
      if (p.entry.label === old) p.entry.label = patch.name;
    }, `meta:${Object.keys(patch).join()}`);
  function toggleTarget(t: Target) {
    const has = project.value.meta.targets.includes(t);
    if (has && project.value.meta.targets.length === 1) return; // at least one target (schema.ts)
    mutate((p) => { p.meta.targets = has ? p.meta.targets.filter((x) => x !== t) : [...p.meta.targets, t]; });
  }
  const updateEntry = (patch: Partial<Project['entry']>) =>
    mutate((p) => { Object.assign(p.entry, patch); dropUndefined(p.entry); }, `entry:${Object.keys(patch).join()}`);
  /** Show (patch) or remove (null) the banner; undefined fields go back to their defaults */
  const updateBanner = (patch: Banner | null) =>
    mutate((p) => {
      if (patch === null) { delete p.banner; return; }
      const b: Banner = { ...p.banner, ...patch };
      dropUndefined(b);
      p.banner = b;
    }, patch ? `banner:${Object.keys(patch).join()}` : 'banner:remove');
  /** Set or clear (undefined) custom colors; an empty theme is removed so the file stays clean */
  const updateTheme = (patch: Theme) =>
    mutate((p) => {
      const t: Theme = { ...p.theme, ...patch };
      dropUndefined(t);
      if (Object.keys(t).length) p.theme = t; else delete p.theme;
    }, `theme:${Object.keys(patch).join()}`);

  // ---- data fields ----
  // Fields are addressed by key path: ['incidents'] is top-level, ['incidents', 'priority'] is
  // an item field of that list. Renames rewrite every reference that RESOLVES to the field
  // (via list scope), so two lists that both have a `title` item field don't collide.
  function addState(field: StateField): string {
    let key = field.key;
    mutate((p) => {
      key = uniqueId(field.key, new Set(p.state.map((s) => s.key))).replace(/-/g, '');
      p.state.push({ ...field, key });
    });
    return key;
  }
  function updateFieldAt(path: string[], patch: Partial<StateField>) {
    mutate((p) => {
      const f = fieldAt(p, path);
      if (!f) return;
      Object.assign(f, patch);
      for (const k of Object.keys(f) as (keyof StateField)[]) if (f[k] === undefined) delete f[k];
    }, `field:${path.join('.')}:${Object.keys(patch).join()}`);
  }
  const updateState = (key: string, patch: Partial<StateField>) => updateFieldAt([key], patch);

  function renameFieldAt(path: string[], next: string): boolean {
    const f = fieldAt(project.value, path);
    if (!f) return false;
    if (f.key === next) return true;
    const siblings = path.length === 1 ? project.value.state : fieldAt(project.value, path.slice(0, -1))?.itemFields ?? [];
    if (!IDENT.test(next) || siblings.some((x) => x.key === next)) return false;
    const old = f.key;
    mutate((p) => {
      const field = fieldAt(p, path)!;
      const parentList = path.length > 1 ? fieldAt(p, path.slice(0, -1)) : undefined;
      // collect first: renaming changes how keys resolve
      const binds: Node[] = [];
      const vis: Node[] = [];
      const tables: Node[] = [];
      for (const { node, ancestors } of walkWithAncestors(p)) {
        if (node.bind && resolveKey(p, ancestors, node.bind) === field) binds.push(node);
        if (node.visibleWhen && resolveKey(p, ancestors, node.visibleWhen.key) === field) vis.push(node);
        if (parentList && node.type === 'table' && node.bind && resolveKey(p, ancestors, node.bind) === parentList) tables.push(node);
      }
      const renamed = (k: string) => (k.startsWith('$item.') ? `$item.${next}` : next);
      field.key = next;
      for (const n of binds) n.bind = renamed(n.bind!);
      for (const n of vis) n.visibleWhen!.key = renamed(n.visibleWhen!.key);
      for (const n of tables) {
        const cols = n.props.columns;
        if (Array.isArray(cols)) n.props.columns = cols.map((c) => (c === old ? next : c));
      }
      if (path.length === 1) for (const a of p.actions) if (a.kind === 'state-set' && a.params?.key === old) a.params.key = next;
    });
    return true;
  }
  const renameStateKey = (key: string, next: string) => renameFieldAt([key], next);

  /** Change an enum option's stored value, carrying defaults, show-when values and state-set values along */
  function renameOptionAt(path: string[], index: number, next: string): boolean {
    const f = fieldAt(project.value, path);
    const opt = f?.options?.[index];
    if (!f || !opt) return false;
    if (opt.value === next) return true;
    if (!IDENT.test(next) || f.options!.some((o) => o.value === next)) return false;
    const old = opt.value;
    mutate((p) => {
      const field = fieldAt(p, path)!;
      const hits: VisibleWhen[] = [];
      for (const { node, ancestors } of walkWithAncestors(p)) {
        const v = node.visibleWhen;
        if (v && v.value === old && resolveKey(p, ancestors, v.key) === field) hits.push(v);
      }
      field.options![index]!.value = next;
      if (field.default === old) field.default = next;
      for (const v of hits) v.value = next;
      if (path.length === 1) {
        for (const a of p.actions) if (a.kind === 'state-set' && a.params && a.params.key === path[0] && a.params.value === old) a.params.value = next;
      }
    });
    return true;
  }

  function addItemFieldAt(listPath: string[]) {
    mutate((p) => {
      const list = fieldAt(p, listPath);
      if (!list) return;
      const taken = new Set((list.itemFields ?? []).map((x) => x.key));
      let key = 'field';
      for (let n = 2; taken.has(key); n++) key = `field${n}`;
      list.itemFields = [...(list.itemFields ?? []), { key, type: 'string' }];
    });
  }
  function removeFieldAt(path: string[]) {
    mutate((p) => {
      if (path.length === 1) { p.state = p.state.filter((s) => s.key !== path[0]); return; }
      const list = fieldAt(p, path.slice(0, -1));
      if (list?.itemFields) list.itemFields = list.itemFields.filter((x) => x.key !== path[path.length - 1]);
    });
  }
  const removeState = (key: string) => removeFieldAt([key]);

  // ---- actions ----
  function addAction(a: Action): string {
    let id = a.id;
    mutate((p) => {
      id = uniqueId(a.id, new Set(p.actions.map((x) => x.id)));
      p.actions.push({ ...a, id });
    });
    return id;
  }
  function updateAction(id: string, patch: Partial<Action>) {
    mutate((p) => { const a = p.actions.find((x) => x.id === id); if (a) Object.assign(a, patch); }, `action:${id}:${Object.keys(patch).join()}`);
  }
  function renameAction(id: string, next: string): boolean {
    if (id === next) return true;
    if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(next) || project.value.actions.some((a) => a.id === next)) return false;
    mutate((p) => {
      p.actions.find((a) => a.id === id)!.id = next;
      for (const s of p.screens) for (const n of walk(s.root)) {
        for (const [ev, a] of Object.entries(n.on ?? {})) if (a === id) n.on![ev] = next;
      }
    });
    return true;
  }
  function removeAction(id: string) {
    mutate((p) => { p.actions = p.actions.filter((a) => a.id !== id); });
  }

  // ---- Claude drafts (PLAN.md Phase 4) ----
  /** Insert a draft as ONE undo step: as a new screen, or into the current selection */
  function applyDraft(d: DraftResult, mode: 'new-screen' | 'insert') {
    let selectId = '';
    let screen = '';
    mutate((p) => {
      p.state.push(...structuredCloneSafe(d.newFields));
      p.actions.push(...structuredCloneSafe(d.newActions));
      const root = structuredCloneSafe(d.root);
      if (mode === 'new-screen') {
        const taken = new Set([...p.screens.map((s) => s.id), ...allNodeIds(p)]);
        screen = uniqueId(d.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').replace(/^(?![a-z])/, 's-') || 'screen', taken);
        p.screens.push({ id: screen, title: d.title, surface: 'pane', root });
        selectId = root.id;
      } else {
        const at = insertionPoint();
        const target = locate(p, at.parentId)?.node;
        if (!target || target.kind !== 'container') return;
        target.children.splice(at.index, 0, ...root.children);
        selectId = root.children[0]?.id ?? target.id;
      }
    });
    if (screen) screenId.value = screen;
    if (selectId) select(selectId);
  }

  // ---- handoff settings (PLAN.md Phase 2) ----
  function setHandoffNotes(notes: string) {
    mutate((p) => {
      p.handoff = { ...(p.handoff ?? {}), notes: notes || undefined };
      if (!p.handoff.notes) delete p.handoff.notes;
      if (!Object.keys(p.handoff).length) delete p.handoff;
    }, 'handoff:notes');
  }
  function setStarter(t: Target, value: string) {
    mutate((p) => {
      const starters = { ...(p.handoff?.starters ?? {}) };
      if (value.trim()) starters[t] = value; else delete starters[t];
      p.handoff = { ...(p.handoff ?? {}), starters };
      if (!Object.keys(starters).length) delete p.handoff.starters;
      if (!Object.keys(p.handoff).length) delete p.handoff;
    }, `handoff:starter:${t}`);
  }

  // ---- spelling ----
  function fixSpelling(m: Misspelling, next: string) {
    mutate((p) => setText(p, m.spot.loc, replaceWord(m.spot.text, m.start, m.word, next)));
  }
  /** Project dictionary travels with the project file, so a team shares it */
  function allowWord(word: string) {
    mutate((p) => {
      const words = new Set([...(p.meta.spellingAllow ?? []), word.toLowerCase()]);
      p.meta.spellingAllow = [...words].sort();
    });
  }

  // ---- persistence: localStorage is the browser's only copy (static site, D6); export is the real save ----
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  watch(project, () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(project.value)); } catch { /* storage blocked or full: export still works */ }
    }, 300);
  }, { deep: true });

  return {
    project, screenId, selectedId, screen, selected, issues, issuesByRef, restoreNote, spelling, fixSpelling, allowWord,
    setHandoffNotes, setStarter, applyDraft,
    canUndo: computed(() => undoStack.value.length > 0), canRedo: computed(() => redoStack.value.length > 0),
    undo, redo, replaceProject, select, selectScreen,
    addNode, insertionPoint, canMove, moveNode, removeNode, duplicateNode, nudge, canIndent, indent, canOutdent, outdent,
    setProp, setBind, setEvent, setVisibleWhen, setHiddenOn, setContainerType, renameNode, addTab,
    addScreen, removeScreen, updateScreen, renameScreen,
    updateMeta, toggleTarget, updateEntry, updateTheme, updateBanner,
    addState, updateState, renameStateKey, removeState,
    updateFieldAt, renameFieldAt, renameOptionAt, addItemFieldAt, removeFieldAt,
    addAction, updateAction, renameAction, removeAction,
  };
});

/** Optional fields are absent, never `undefined` (keeps saved JSON and snapshots stable) */
function dropUndefined(o: object) {
  for (const [k, v] of Object.entries(o)) if (v === undefined) delete (o as Record<string, unknown>)[k];
}

function restore(): { project: Project; note: string } {
  let raw: string | null = null;
  let note = '';
  try { raw = localStorage.getItem(STORAGE_KEY); } catch { /* storage blocked: start fresh */ }
  // first visit to the dev preview: start from a COPY of the live autosave (read only, never written back)
  if (!raw && CHANNEL === 'dev') {
    try { raw = localStorage.getItem(storageKeyFor('live')); } catch { /* blocked */ }
    if (raw) note = 'This is the dev preview. It opened a copy of your project from the live site; changes here stay in the dev preview and never change the live one.';
  }
  if (!raw) return { project: newProject(), note: '' };
  const r = loadProject(raw);
  if (r.ok) return { project: r.project, note };
  try { localStorage.setItem(`${STORAGE_KEY}:recovered`, raw); } catch { /* best effort */ }
  return { project: newProject(), note: `Your last session couldn't be reopened, so a fresh project was started. The old copy is saved in this browser under ${STORAGE_KEY}:recovered.` };
}

/** Drafts come from parsed JSON (plain data), but copy anyway so the store never shares references with a preview */
function structuredCloneSafe<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}
