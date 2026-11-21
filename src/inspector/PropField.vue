<script setup lang="ts">
// One catalog prop → one form control. Emits undefined to clear back to the default.
import { computed } from 'vue';
import type { PropSpec } from '../spec/catalog';
import type { PropValue } from '../spec/types';

const props = defineProps<{ spec: PropSpec; value: PropValue | undefined }>();
const emit = defineEmits<{ update: [PropValue | undefined] }>();

const listText = computed(() => (Array.isArray(props.value) ? props.value.join('\n') : ''));
const placeholder = computed(() => ('default' in props.spec && props.spec.default !== undefined ? String(props.spec.default) : ''));

function onNumber(raw: string) {
  if (raw.trim() === '') return emit('update', undefined);
  const n = Number(raw);
  if (!Number.isNaN(n)) emit('update', n);
}
function onList(raw: string) {
  const vals = raw.split('\n').map((s) => s.trim()).filter(Boolean);
  emit('update', vals.length ? vals : undefined);
}
</script>

<template>
  <label class="pf" :class="spec.kind">
    <span class="l">{{ spec.label }}<b v-if="'required' in spec && spec.required" title="required">*</b></span>

    <template v-if="spec.kind === 'string'">
      <textarea v-if="spec.multiline" rows="2" :spellcheck="!spec.noSpell" :value="(value as string) ?? ''" :placeholder="placeholder" @input="emit('update', ($event.target as HTMLTextAreaElement).value || undefined)" />
      <input v-else :spellcheck="!spec.noSpell" :value="(value as string) ?? ''" :placeholder="placeholder" @input="emit('update', ($event.target as HTMLInputElement).value || undefined)" />
    </template>

    <input v-else-if="spec.kind === 'number'" type="number" :min="spec.min" :max="spec.max" :value="value ?? ''" :placeholder="placeholder"
      @input="onNumber(($event.target as HTMLInputElement).value)" />

    <input v-else-if="spec.kind === 'boolean'" type="checkbox" :checked="(value ?? spec.default ?? false) as boolean"
      @change="emit('update', ($event.target as HTMLInputElement).checked)" />

    <select v-else-if="spec.kind === 'enum'" :value="value ?? spec.default ?? ''" @change="emit('update', ($event.target as HTMLSelectElement).value)">
      <option v-for="o in spec.options" :key="o" :value="o">{{ o }}</option>
    </select>

    <textarea v-else-if="spec.kind === 'stringList'" rows="3" :value="listText" placeholder="one per line" @change="onList(($event.target as HTMLTextAreaElement).value)" />
  </label>
</template>

<style scoped>
.pf { display: grid; grid-template-columns: 110px 1fr; gap: 6px; align-items: center; margin: 5px 0; font-size: 12px; }
.pf.boolean { grid-template-columns: 110px auto; justify-content: start; }
.l { color: var(--muted); } .l b { color: var(--err); margin-left: 2px; }
input:not([type='checkbox']), select, textarea { font: inherit; width: 100%; padding: 4px 6px; border: 1px solid var(--line); border-radius: 5px; background: var(--bg); color: var(--fg); }
textarea { resize: vertical; }
</style>
