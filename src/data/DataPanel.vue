<script setup lang="ts">
// The plugin's data model: every field inputs can connect to (PLAN.md §4 "state").
import { computed } from 'vue';
import { walk } from '../spec/tree';
import { useProject } from '../store/project';
import FieldEditor from './FieldEditor.vue';

const store = useProject();

/** key → how many nodes bind/visibleWhen to it, so "safe to delete?" is visible */
const usage = computed(() => {
  const m = new Map<string, number>();
  for (const s of store.project.screens) for (const n of walk(s.root)) {
    for (const k of [n.bind, n.visibleWhen?.key]) if (k) m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
});

function add() {
  store.addState({ key: 'newField', label: 'New field', type: 'string' });
}
function remove(key: string) {
  const used = usage.value.get(key) ?? 0;
  if (used && !confirm(`"${key}" is connected to ${used} component(s). Delete it anyway? They'll show an error until reconnected.`)) return;
  store.removeState(key);
}
</script>

<template>
  <div class="panel">
    <p class="intro">Data fields are what your plugin keeps track of: a status, a location, a list of incidents. Inputs and labels connect to them.</p>
    <FieldEditor
      v-for="f in store.project.state"
      :key="f.key"
      :field="f"
      :path="[f.key]"
      :used-by="usage.get(f.key) ?? 0"
      @remove="remove(f.key)"
    />
    <button class="add" @click="add">+ Add data field</button>
  </div>
</template>

<style scoped>
.panel { padding: 8px; }
.intro { font-size: 12px; color: var(--muted); margin: 2px 2px 10px; }
.add { font: inherit; font-size: 12px; width: 100%; padding: 7px; border: 1px dashed var(--line); border-radius: 6px; background: none; color: var(--accent); cursor: pointer; }
</style>
