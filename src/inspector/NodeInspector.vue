<script setup lang="ts">
// Inspector for the selected node: settings, connected data, events → actions (with the
// action's description editable in place), visibility, per-platform hiding, issues.
import { computed } from 'vue';
import { componentSpec } from '../spec/catalog';
import { toIdent } from '../spec/factory';
import { listScope, type Located } from '../spec/tree';
import { ACTION_KINDS, TARGETS, type ActionKind, type ContainerType, type StateField, type StateType, type VisibleWhen } from '../spec/types';
import { TARGET_NAMES } from '../spec/validate';
import { useProject } from '../store/project';
import CommitField from './CommitField.vue';
import PropField from './PropField.vue';
import SpellList from '../spell/SpellList.vue';

const props = defineProps<{ at: Located }>();
const store = useProject();

const n = computed(() => props.at.node);
const spec = computed(() => componentSpec(n.value.kind, n.value.type));
const isRoot = computed(() => props.at.parent === null);
const issues = computed(() => store.issuesByRef.get(n.value.id) ?? []);
const typos = computed(() => store.spelling.filter((m) => m.spot.ref === n.value.id));
const SWITCHABLE: ContainerType[] = ['stack', 'row', 'grid', 'section', 'collapsible', 'scroll'];

// ---- data binding ----
const item = computed(() => listScope(store.project, props.at.ancestors));
const bindChoices = computed(() => {
  const types = spec.value?.bindTypes ?? [];
  const top = store.project.state.filter((f) => types.includes(f.type)).map((f) => ({ value: f.key, label: `${f.label ?? f.key} (${f.type})` }));
  const inner = (item.value?.itemFields ?? []).filter((f) => types.includes(f.type)).map((f) => ({ value: `$item.${f.key}`, label: `each item → ${f.key} (${f.type})` }));
  return [...inner, ...top];
});
const ACCEPT_WORDS: Record<StateType, string> = {
  string: 'text', number: 'number', boolean: 'yes/no', enum: 'choice', datetime: 'date/time', point: 'location', contact: 'contact', list: 'list',
};

function newFieldFor(): StateField {
  const t = spec.value!.bindTypes![0]!;
  const name = String(n.value.props.label ?? n.value.props.text ?? n.value.props.title ?? spec.value!.label);
  const field: StateField = { key: toIdent(name), label: name, type: t };
  if (t === 'enum') field.options = [{ value: 'option1', label: 'Option 1' }, { value: 'option2', label: 'Option 2' }];
  if (t === 'list') field.itemFields = [{ key: 'name', type: 'string' }];
  return field;
}
function onBind(v: string) {
  if (v === '__new') {
    const key = store.addState(newFieldFor());
    store.setBind(n.value.id, key);
  } else store.setBind(n.value.id, v || undefined);
}

// ---- events ----
function onEvent(ev: string, v: string) {
  if (v === '__new') {
    const label = String(n.value.props.text ?? n.value.props.label ?? `${spec.value?.label} ${ev}`);
    const id = store.addAction({ id: `${n.value.id}-${ev}`, label, intent: '', kind: 'custom' });
    store.setEvent(n.value.id, ev, id);
  } else store.setEvent(n.value.id, ev, v || undefined);
}
const actionFor = (ev: string) => store.project.actions.find((a) => a.id === n.value.on?.[ev]);

// ---- visibility ----
const visFields = computed(() => [
  ...(item.value?.itemFields ?? []).map((f) => ({ key: `$item.${f.key}`, f })),
  ...store.project.state.filter((f) => f.type !== 'list').map((f) => ({ key: f.key, f })),
]);
const visField = computed(() => visFields.value.find((x) => x.key === n.value.visibleWhen?.key)?.f);
function setVis(patch: Partial<VisibleWhen> | null) {
  if (patch === null) return store.setVisibleWhen(n.value.id, undefined);
  const cur: VisibleWhen = n.value.visibleWhen ?? { key: visFields.value[0]?.key ?? '', op: 'truthy' };
  const next = { ...cur, ...patch };
  if (next.op === 'truthy' || next.op === 'falsy') delete next.value;
  store.setVisibleWhen(n.value.id, next);
}
</script>

<template>
  <div v-if="spec" class="ni">
    <header>
      <h3>{{ spec.label }}</h3>
      <p class="desc">{{ spec.description }}</p>
      <p class="support">
        <span v-for="t in store.project.meta.targets" :key="t" :class="spec.support[t]" :title="`${TARGET_NAMES[t]}: ${spec.support[t]}`">{{ TARGET_NAMES[t] }} {{ spec.support[t] === 'native' ? '✓' : spec.support[t] === 'approx' ? '≈' : spec.support[t] === 'none' ? '✗' : '?' }}</span>
      </p>
    </header>

    <ul v-if="issues.length" class="issues">
      <li v-for="(i, k) in issues" :key="k" :class="i.severity">{{ i.message }}</li>
    </ul>

    <div v-if="typos.length" class="typos"><b>Spelling</b> <small>click a word for fixes</small><SpellList :items="typos" /></div>

    <div class="row"><span class="l">Id</span><CommitField :value="n.id" mono :commit="(v) => store.renameNode(n.id, v)" /></div>
    <div v-if="n.kind === 'container' && SWITCHABLE.includes(n.type as ContainerType)" class="row">
      <span class="l">Layout</span>
      <select :value="n.type" @change="store.setContainerType(n.id, ($event.target as HTMLSelectElement).value as ContainerType)">
        <option v-for="t in SWITCHABLE" :key="t" :value="t">{{ componentSpec('container', t)?.label }}</option>
      </select>
    </div>

    <h4 v-if="Object.keys(spec.props).length" data-tour="settings">Settings</h4>
    <PropField v-for="(ps, name) in spec.props" :key="name" :spec="ps" :value="n.props[name]" @update="(v) => store.setProp(n.id, name as string, v)" />
    <button v-if="n.kind === 'container' && n.type === 'tabs'" class="link" @click="store.addTab(n.id)">+ Add tab</button>

    <template v-if="spec.bindTypes">
      <h4>Connected data <small>takes: {{ spec.bindTypes.map((t) => ACCEPT_WORDS[t]).join(', ') }}</small></h4>
      <select :value="n.bind ?? ''" data-tour="bind" @change="onBind(($event.target as HTMLSelectElement).value)">
        <option value="">— not connected —</option>
        <option v-for="c in bindChoices" :key="c.value" :value="c.value">{{ c.label }}</option>
        <option v-if="n.bind && !bindChoices.some((c) => c.value === n.bind)" :value="n.bind">{{ n.bind }} (missing!)</option>
        <option value="__new">+ New data field…</option>
      </select>
    </template>

    <template v-if="spec.events">
      <h4>When…</h4>
      <div v-for="ev in spec.events" :key="ev" class="event">
        <div class="row">
          <span class="l">{{ ev }}</span>
          <select :value="n.on?.[ev] ?? ''" :data-tour="'event-' + ev" @change="onEvent(ev, ($event.target as HTMLSelectElement).value)">
            <option value="">— nothing —</option>
            <option v-for="a in store.project.actions" :key="a.id" :value="a.id">{{ a.label || a.id }}</option>
            <option value="__new">+ New action…</option>
          </select>
        </div>
        <div v-if="actionFor(ev)" class="action-box">
          <div class="row"><span class="l">Name</span><input :value="actionFor(ev)!.label" @input="store.updateAction(actionFor(ev)!.id, { label: ($event.target as HTMLInputElement).value })" /></div>
          <div class="row"><span class="l">Kind</span>
            <select :value="actionFor(ev)!.kind" @change="store.updateAction(actionFor(ev)!.id, { kind: ($event.target as HTMLSelectElement).value as ActionKind })">
              <option v-for="k in ACTION_KINDS" :key="k" :value="k">{{ k }}</option>
            </select>
          </div>
          <label class="intent" data-tour="intent">What should it do? <small>(the coding agent builds from this)</small>
            <textarea rows="3" :value="actionFor(ev)!.intent" placeholder="e.g. Send a CoT with my status to the team, then show a toast"
              @input="store.updateAction(actionFor(ev)!.id, { intent: ($event.target as HTMLTextAreaElement).value })" />
          </label>
        </div>
      </div>
    </template>

    <template v-if="!isRoot">
      <h4>Show only when…</h4>
      <div v-if="!n.visibleWhen" class="row">
        <button class="link" :disabled="!visFields.length" @click="setVis({})">{{ visFields.length ? '+ Add condition' : 'Add a data field first' }}</button>
      </div>
      <div v-else class="vis">
        <select :value="n.visibleWhen.key" @change="setVis({ key: ($event.target as HTMLSelectElement).value })">
          <option v-for="v in visFields" :key="v.key" :value="v.key">{{ v.key }}</option>
        </select>
        <select :value="n.visibleWhen.op" @change="setVis({ op: ($event.target as HTMLSelectElement).value as VisibleWhen['op'] })">
          <option value="truthy">is on / set</option><option value="falsy">is off / empty</option>
          <option value="eq">equals</option><option value="neq">is not</option>
        </select>
        <template v-if="n.visibleWhen.op === 'eq' || n.visibleWhen.op === 'neq'">
          <select v-if="visField?.type === 'enum'" :value="n.visibleWhen.value ?? ''" @change="setVis({ value: ($event.target as HTMLSelectElement).value })">
            <option value="" disabled>choose…</option>
            <option v-for="o in visField.options" :key="o.value" :value="o.value">{{ o.label }}</option>
          </select>
          <input v-else :value="n.visibleWhen.value ?? ''" placeholder="value" @input="setVis({ value: ($event.target as HTMLInputElement).value })" />
        </template>
        <button class="link danger" @click="setVis(null)">remove</button>
      </div>

      <h4>Platforms</h4>
      <div class="targets">
        <label v-for="t in TARGETS.filter((x) => store.project.meta.targets.includes(x))" :key="t">
          <input type="checkbox" :checked="n.targetOverrides?.[t]?.hidden === true" @change="store.setHiddenOn(n.id, t, ($event.target as HTMLInputElement).checked)" />
          hide on {{ TARGET_NAMES[t] }}
        </label>
      </div>

      <h4>Move</h4>
      <div class="move">
        <button :disabled="at.index === 0" title="Move up (Alt+↑)" @click="store.nudge(n.id, -1)">↑ Up</button>
        <button :disabled="at.index >= at.parent!.children.length - 1" title="Move down (Alt+↓)" @click="store.nudge(n.id, 1)">↓ Down</button>
        <button :disabled="!store.canIndent(n.id)" title="Put inside the layout block above (Alt+→)" @click="store.indent(n.id)">→ Into block above</button>
        <button :disabled="!store.canOutdent(n.id)" title="Move out of this layout block (Alt+←)" @click="store.outdent(n.id)">← Out of block</button>
      </div>

      <div class="buttons">
        <button @click="store.duplicateNode(n.id)">Duplicate <kbd>Ctrl+D</kbd></button>
        <button class="danger" @click="store.removeNode(n.id)">Delete <kbd>Del</kbd></button>
      </div>
    </template>
    <p v-else class="muted">This is the screen's outer layout block. Click empty space to edit the screen itself.</p>
  </div>
</template>

<style scoped>
.ni { padding: 10px 12px; font-size: 13px; }
h3 { margin: 0; font-size: 15px; } h4 { margin: 14px 0 4px; font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); }
h4 small { text-transform: none; letter-spacing: 0; font-weight: 400; }
.desc { margin: 2px 0 6px; color: var(--muted); font-size: 12px; }
.support { display: flex; gap: 6px; flex-wrap: wrap; margin: 0; }
.support span { font-size: 11px; padding: 1px 6px; border-radius: 8px; border: 1px solid var(--line); }
.support .native { color: var(--ok); } .support .approx { color: var(--warn); } .support .none { color: var(--err); } .support .unverified { color: var(--muted); }
.issues { list-style: none; padding: 0; margin: 8px 0; }
.issues li { font-size: 12px; padding: 4px 6px; border-radius: 4px; margin-bottom: 3px; }
.issues .error { background: color-mix(in srgb, var(--err) 14%, transparent); }
.issues .warning { background: color-mix(in srgb, var(--warn) 14%, transparent); }
.typos { font-size: 12px; margin: 6px 0; padding: 4px 8px; border-radius: 4px; background: color-mix(in srgb, var(--accent) 8%, transparent); }
.typos small { color: var(--muted); }
.row { display: grid; grid-template-columns: 110px 1fr; gap: 6px; align-items: center; margin: 5px 0; }
.l { color: var(--muted); font-size: 12px; }
select, input:not([type='checkbox']), textarea { font: inherit; font-size: 12px; width: 100%; padding: 4px 6px; border: 1px solid var(--line); border-radius: 5px; background: var(--bg); color: var(--fg); }
.event { margin-bottom: 6px; }
.action-box { border-left: 3px solid var(--ok); padding: 2px 0 4px 8px; margin: 4px 0 8px; }
.intent { display: flex; flex-direction: column; gap: 3px; font-size: 12px; color: var(--muted); }
.intent small { font-size: 11px; }
.vis { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; }
.targets { display: flex; flex-direction: column; gap: 3px; font-size: 12px; }
.buttons { display: flex; gap: 6px; margin-top: 16px; }
.move { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; }
.move button { font: inherit; font-size: 12px; padding: 5px 6px; border: 1px solid var(--line); border-radius: 6px; background: var(--panel); color: var(--fg); cursor: pointer; }
.move button:disabled { opacity: .4; cursor: default; }
.buttons button, .link { font: inherit; font-size: 12px; padding: 5px 10px; border: 1px solid var(--line); border-radius: 6px; background: var(--panel); color: var(--fg); cursor: pointer; }
.link { border: 0; background: none; color: var(--accent); padding: 4px 0; }
.danger { color: var(--err) !important; }
kbd { font-size: 10px; color: var(--muted); margin-left: 4px; }
.muted { color: var(--muted); font-size: 12px; }
</style>
