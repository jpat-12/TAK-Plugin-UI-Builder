<script setup lang="ts">
// Misspellings with one-click fixes. Used by the Problems bar (all) and the inspector (one node).
import { ref } from 'vue';
import { useProject } from '../store/project';
import { suggestions } from './dictionary';
import type { Misspelling } from './words';

defineProps<{ items: Misspelling[]; showWhere?: boolean }>();
const store = useProject();
/** suggestions are slow to compute; only for the rows the user expands */
const open = ref<Set<string>>(new Set());
const keyOf = (m: Misspelling) => `${JSON.stringify(m.spot.loc)}:${m.start}`;
const toggle = (m: Misspelling) => {
  const k = keyOf(m);
  const next = new Set(open.value);
  if (next.has(k)) next.delete(k); else next.add(k);
  open.value = next;
};
function context(m: Misspelling) {
  const t = m.spot.text;
  const a = Math.max(0, m.start - 24);
  const b = Math.min(t.length, m.start + m.word.length + 24);
  return { before: (a > 0 ? '…' : '') + t.slice(a, m.start), after: t.slice(m.start + m.word.length, b) + (b < t.length ? '…' : '') };
}
function goTo(m: Misspelling) {
  if (m.spot.ref) store.select(m.spot.ref);
}
</script>

<template>
  <ul class="spell">
    <li v-for="m in items" :key="keyOf(m)">
      <div class="line">
        <button class="word" :title="'Show fixes for ' + m.word" @click="toggle(m)">{{ m.word }}</button>
        <span class="ctx">{{ context(m).before }}<u>{{ m.word }}</u>{{ context(m).after }}</span>
        <button v-if="showWhere" class="where" :disabled="!m.spot.ref" @click="goTo(m)">{{ m.spot.where }}</button>
      </div>
      <div v-if="open.has(keyOf(m))" class="fixes">
        <template v-if="suggestions(m.word).length">
          Change to:
          <button v-for="s in suggestions(m.word)" :key="s" class="sug" @click="store.fixSpelling(m, s)">{{ s }}</button>
        </template>
        <span v-else class="muted">No suggestions.</span>
        <button class="allow" @click="store.allowWord(m.word)">Add “{{ m.word }}” to the project dictionary</button>
      </div>
    </li>
  </ul>
</template>

<style scoped>
.spell { list-style: none; margin: 0; padding: 0; }
li { padding: 4px 0; }
.line { display: flex; gap: 8px; align-items: baseline; flex-wrap: wrap; }
.word { font: inherit; font-weight: 600; border: 0; background: none; color: var(--err); cursor: pointer; padding: 0; text-decoration: underline wavy var(--err); text-underline-offset: 3px; }
.ctx { color: var(--muted); font-size: 12px; }
.ctx u { text-decoration: underline wavy var(--err); color: var(--fg); }
.where { font: inherit; font-size: 11px; border: 0; background: none; color: var(--accent); cursor: pointer; padding: 0; margin-left: auto; }
.where:disabled { color: var(--muted); cursor: default; }
.fixes { display: flex; gap: 4px; flex-wrap: wrap; align-items: center; margin: 4px 0 2px 12px; font-size: 12px; color: var(--muted); }
.sug, .allow { font: inherit; font-size: 12px; border: 1px solid var(--line); border-radius: 10px; padding: 1px 8px; background: var(--panel); color: var(--fg); cursor: pointer; }
.sug { color: var(--ok); }
.allow { border-style: dashed; }
.muted { color: var(--muted); }
</style>
