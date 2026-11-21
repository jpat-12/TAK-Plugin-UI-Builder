<script setup lang="ts">
// Every action, its plain-English intent, its kind-specific params, and what triggers it.
import { computed } from 'vue';
import { walk } from '../spec/tree';
import { ACTION_KINDS, type Action, type ActionKind } from '../spec/types';
import { useProject } from '../store/project';
import CommitField from '../inspector/CommitField.vue';

const store = useProject();

const KIND_WORDS: Record<ActionKind, string> = {
  'cot-send': 'Send a CoT', http: 'Call a web API', 'map-pick': 'Pick a point on the map',
  navigate: 'Open a screen', 'state-set': 'Change a data field', custom: 'Something else',
};

/** action id → [{ nodeId, event }] that trigger it */
const triggers = computed(() => {
  const m = new Map<string, { id: string; ev: string }[]>();
  for (const s of store.project.screens) for (const n of walk(s.root)) {
    for (const [ev, a] of Object.entries(n.on ?? {})) m.set(a, [...(m.get(a) ?? []), { id: n.id, ev }]);
  }
  return m;
});

const setParam = (a: Action, k: string, v: string) => {
  const params = { ...(a.params ?? {}) };
  if (v) params[k] = v; else delete params[k];
  store.updateAction(a.id, { params: Object.keys(params).length ? params : undefined });
};

function add() {
  store.addAction({ id: 'new-action', label: 'New action', intent: '', kind: 'custom' });
}
</script>

<template>
  <div class="panel">
    <p class="intro">Actions are what happens when someone taps or changes something. Describe each one in plain words; the coding agent writes the code.</p>
    <div v-for="a in store.project.actions" :key="a.id" class="act" :class="{ bad: (store.issuesByRef.get(a.id) ?? []).some((i) => i.severity === 'error') }">
      <div class="top">
        <input class="name" :value="a.label" placeholder="Action name" @input="store.updateAction(a.id, { label: ($event.target as HTMLInputElement).value })" />
        <button class="x" title="Delete action" @click="store.removeAction(a.id)">✕</button>
      </div>
      <div class="row"><span class="l">Id</span><CommitField :value="a.id" mono :commit="(v) => store.renameAction(a.id, v)" /></div>
      <div class="row"><span class="l">Kind</span>
        <select :value="a.kind" @change="store.updateAction(a.id, { kind: ($event.target as HTMLSelectElement).value as ActionKind })">
          <option v-for="k in ACTION_KINDS" :key="k" :value="k">{{ KIND_WORDS[k] }}</option>
        </select>
      </div>
      <div v-if="a.kind === 'navigate'" class="row"><span class="l">Screen</span>
        <select :value="a.params?.screen ?? ''" @change="setParam(a, 'screen', ($event.target as HTMLSelectElement).value)">
          <option value="" disabled>choose…</option>
          <option v-for="s in store.project.screens" :key="s.id" :value="s.id">{{ s.title || s.id }}</option>
        </select>
      </div>
      <template v-if="a.kind === 'state-set'">
        <div class="row"><span class="l">Field</span>
          <select :value="a.params?.key ?? ''" @change="setParam(a, 'key', ($event.target as HTMLSelectElement).value)">
            <option value="" disabled>choose…</option>
            <option v-for="f in store.project.state" :key="f.key" :value="f.key">{{ f.key }}</option>
          </select>
        </div>
        <div class="row"><span class="l">To</span><input :value="a.params?.value ?? ''" @input="setParam(a, 'value', ($event.target as HTMLInputElement).value)" /></div>
      </template>
      <template v-if="a.kind === 'http'">
        <div class="row"><span class="l">Method</span>
          <select :value="a.params?.method ?? 'GET'" @change="setParam(a, 'method', ($event.target as HTMLSelectElement).value)">
            <option v-for="m in ['GET', 'POST', 'PUT', 'DELETE']" :key="m">{{ m }}</option>
          </select>
        </div>
        <div class="row"><span class="l">URL</span><input :value="a.params?.url ?? ''" placeholder="https://… (or describe it below)" @input="setParam(a, 'url', ($event.target as HTMLInputElement).value)" /></div>
      </template>
      <div v-if="a.kind === 'cot-send'" class="row"><span class="l">CoT type</span><input :value="a.params?.cotType ?? ''" placeholder="optional, e.g. b-m-p-s-p-i" @input="setParam(a, 'cotType', ($event.target as HTMLInputElement).value)" /></div>
      <textarea rows="3" :value="a.intent" placeholder="What should it do? e.g. Send my status to the team as a CoT, then show 'Sent'"
        @input="store.updateAction(a.id, { intent: ($event.target as HTMLTextAreaElement).value })" />
      <div class="trig">
        <template v-if="triggers.get(a.id)?.length">
          Triggered by:
          <button v-for="t in triggers.get(a.id)" :key="t.id + t.ev" class="chip" @click="store.select(t.id)">#{{ t.id }} · {{ t.ev }}</button>
        </template>
        <span v-else class="warn">Not triggered by anything yet</span>
      </div>
    </div>
    <button class="add" @click="add">+ Add action</button>
  </div>
</template>

<style scoped>
.panel { padding: 8px; font-size: 12px; }
.intro { color: var(--muted); margin: 2px 2px 10px; }
.act { border: 1px solid var(--line); border-left: 3px solid var(--ok); border-radius: 6px; padding: 6px 8px; margin-bottom: 8px; background: var(--bg); }
.act.bad { border-left-color: var(--err); }
.top { display: flex; gap: 4px; }
.name { font-weight: 600; }
.row { display: grid; grid-template-columns: 60px 1fr; gap: 6px; align-items: center; margin: 4px 0; }
.l { color: var(--muted); }
select, input, textarea { font: inherit; width: 100%; padding: 3px 6px; border: 1px solid var(--line); border-radius: 5px; background: var(--panel); color: var(--fg); }
textarea { margin-top: 4px; resize: vertical; }
.x { border: 0; background: none; color: var(--muted); cursor: pointer; }
.trig { margin-top: 4px; color: var(--muted); display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }
.chip { font: inherit; font-size: 11px; border: 1px solid var(--line); border-radius: 10px; padding: 0 6px; background: var(--panel); color: var(--accent); cursor: pointer; }
.warn { color: var(--warn); }
.add { font: inherit; width: 100%; padding: 7px; border: 1px dashed var(--line); border-radius: 6px; background: none; color: var(--accent); cursor: pointer; }
</style>
