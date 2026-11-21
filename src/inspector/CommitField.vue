<script setup lang="ts">
// Text field for values with format rules (ids, keys, packageId, version). Edits stay local
// until Enter/blur, and commit() decides; a rejected value stays red instead of reaching the
// store. This is how schema.ts formats are kept out of the project (see schema.ts header).
import { ref, watch } from 'vue';

const props = defineProps<{ value: string; commit: (v: string) => boolean; hint?: string; mono?: boolean }>();
const draft = ref(props.value);
const bad = ref(false);
watch(() => props.value, (v) => { draft.value = v; bad.value = false; });

function apply() {
  if (draft.value === props.value) { bad.value = false; return; }
  bad.value = !props.commit(draft.value.trim());
  if (!bad.value) draft.value = props.value;
}
</script>

<template>
  <span class="cf">
    <input v-model="draft" :class="{ bad, mono }" spellcheck="false" @keydown.enter="apply" @blur="apply" @keydown.esc="draft = value; bad = false" />
    <small v-if="bad" class="why">{{ hint ?? 'Not allowed: it must be unique and use letters, digits, - or _' }}</small>
  </span>
</template>

<style scoped>
.cf { display: flex; flex-direction: column; gap: 2px; width: 100%; }
input { font: inherit; width: 100%; padding: 4px 6px; border: 1px solid var(--line); border-radius: 5px; background: var(--bg); color: var(--fg); }
input.mono { font-family: ui-monospace, Consolas, monospace; font-size: 12px; }
input.bad { border-color: var(--err); }
.why { color: var(--err); font-size: 11px; }
</style>
