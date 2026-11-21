<script setup lang="ts">
// Raw project JSON. Paste edits go through loadProject (migrate → shape → validate) before
// replacing the project, which is the same path as a file import.
import { computed, ref, watch } from 'vue';
import { loadProject } from '../spec/load';
import type { Issue } from '../spec/validate';
import { useProject } from '../store/project';

const store = useProject();
const current = computed(() => JSON.stringify(store.project, null, 2));
const draft = ref(current.value);
const dirty = ref(false);
const errors = ref<Issue[]>([]);
watch(current, (v) => { if (!dirty.value) draft.value = v; });

function apply() {
  const r = loadProject(draft.value);
  if (!r.ok) { errors.value = r.issues; return; }
  errors.value = [];
  dirty.value = false;
  store.replaceProject(r.project);
}
function reset() {
  draft.value = current.value;
  dirty.value = false;
  errors.value = [];
}
</script>

<template>
  <div class="panel">
    <div class="bar">
      <button :disabled="!dirty" @click="apply">Apply changes</button>
      <button :disabled="!dirty" @click="reset">Discard</button>
      <span class="muted">{{ dirty ? 'Edited, not applied yet' : 'Live view of the project' }}</span>
    </div>
    <ul v-if="errors.length" class="errs"><li v-for="(e, i) in errors" :key="i">{{ e.message }}</li></ul>
    <textarea v-model="draft" spellcheck="false" aria-label="Project JSON" @input="dirty = true" />
  </div>
</template>

<style scoped>
.panel { padding: 8px; display: flex; flex-direction: column; height: 100%; }
.bar { display: flex; gap: 6px; align-items: center; margin-bottom: 6px; }
button { font: inherit; font-size: 12px; padding: 4px 10px; border: 1px solid var(--line); border-radius: 6px; background: var(--panel); color: var(--fg); cursor: pointer; }
button:disabled { opacity: .5; cursor: default; }
.muted { color: var(--muted); font-size: 11px; }
.errs { margin: 0 0 6px; padding-left: 18px; color: var(--err); font-size: 12px; }
textarea { flex: 1; min-height: 60vh; font: 11px/1.45 ui-monospace, Consolas, monospace; padding: 8px; border: 1px solid var(--line); border-radius: 6px; background: var(--bg); color: var(--fg); resize: none; tab-size: 2; }
</style>
