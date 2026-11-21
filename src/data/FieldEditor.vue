<script setup lang="ts">
// Edits one data field, addressed by key path (['incidents'] or ['incidents', 'priority']).
// Recursive: a list's item fields use this same editor. All edits go to the store's
// path-based mutators, which also rewrite references on renames.
import { computed, ref } from 'vue';
import { STATE_TYPES, type EnumOption, type StateField, type StateType } from '../spec/types';
import { toIdent } from '../spec/factory';
import { useProject } from '../store/project';
import CommitField from '../inspector/CommitField.vue';

defineOptions({ name: 'FieldEditor' });
const props = defineProps<{ field: StateField; path: string[]; usedBy?: number }>();
const emit = defineEmits<{ remove: [] }>();
const store = useProject();
const nested = computed(() => props.path.length > 1);
const open = ref(!nested.value);

const TYPE_WORDS: Record<StateType, string> = {
  string: 'Text', number: 'Number', boolean: 'Yes / no', enum: 'Choice (with colors)', datetime: 'Date / time',
  point: 'Map location', contact: 'TAK contact', list: 'List of records',
};
const f = computed(() => props.field);
const patch = (p: Partial<StateField>) => store.updateFieldAt(props.path, p);

function setType(t: StateType) {
  patch({
    type: t,
    default: undefined,
    options: t === 'enum' ? (f.value.options?.length ? f.value.options : [{ value: 'option1', label: 'Option 1' }, { value: 'option2', label: 'Option 2' }]) : undefined,
    itemFields: t === 'list' ? (f.value.itemFields?.length ? f.value.itemFields : [{ key: 'name', type: 'string' }]) : undefined,
  });
}

// enum options: label/color are plain patches; the stored value goes through renameOptionAt
const setOption = (i: number, p: Partial<EnumOption>) => {
  const opts = (f.value.options ?? []).map((o, k) => {
    if (k !== i) return o;
    const next = { ...o, ...p };
    if (!next.color) delete next.color;
    return next;
  });
  patch({ options: opts });
};
const addOption = () => {
  const taken = new Set((f.value.options ?? []).map((o) => o.value));
  let n = (f.value.options?.length ?? 0) + 1;
  while (taken.has(`option${n}`)) n++;
  patch({ options: [...(f.value.options ?? []), { value: `option${n}`, label: `Option ${n}` }] });
};
const removeOption = (i: number) => patch({ options: (f.value.options ?? []).filter((_, k) => k !== i) });
const commitOptionValue = (i: number, v: string) => store.renameOptionAt(props.path, i, toIdent(v));

function setDefault(raw: string) {
  if (raw === '') return patch({ default: undefined });
  if (f.value.type === 'number') { const n = Number(raw); if (!Number.isNaN(n)) patch({ default: n }); return; }
  patch({ default: raw });
}
</script>

<template>
  <div class="fe" :class="{ nested }">
    <div class="head" @click="open = !open">
      <span class="caret">{{ open ? '▾' : '▸' }}</span>
      <b class="key">{{ f.key }}</b>
      <span class="type">{{ TYPE_WORDS[f.type] }}</span>
      <span class="grow" />
      <span v-if="usedBy !== undefined" class="used" :title="`Connected to ${usedBy} component(s)`">{{ usedBy }}×</span>
      <button class="x" title="Delete field" @click.stop="emit('remove')">✕</button>
    </div>

    <div v-if="open" class="body">
      <div class="row"><span class="l">Key</span><CommitField :value="f.key" mono hint="Letters, digits and _ ; unique" :commit="(v) => store.renameFieldAt(path, v)" /></div>
      <div v-if="!nested" class="row"><span class="l">Label</span><input :value="f.label ?? ''" spellcheck="true" @input="patch({ label: ($event.target as HTMLInputElement).value || undefined })" /></div>
      <div class="row"><span class="l">Type</span>
        <select :value="f.type" @change="setType(($event.target as HTMLSelectElement).value as StateType)">
          <option v-for="t in STATE_TYPES" :key="t" :value="t">{{ TYPE_WORDS[t] }}</option>
        </select>
      </div>

      <template v-if="f.type === 'enum'">
        <div class="sub">Options <small>color · label · stored value</small></div>
        <div v-for="(o, i) in f.options ?? []" :key="i" class="opt">
          <input type="color" :value="o.color ?? '#6b7280'" title="Color (status badges, list rows)" @input="setOption(i, { color: ($event.target as HTMLInputElement).value.toUpperCase() })" />
          <input :value="o.label" placeholder="Label" spellcheck="true" @input="setOption(i, { label: ($event.target as HTMLInputElement).value })" />
          <CommitField :value="o.value" mono hint="Letters, digits, _ ; unique" :commit="(v) => commitOptionValue(i, v)" />
          <button class="x" title="Remove option" @click="removeOption(i)">✕</button>
        </div>
        <button class="link" @click="addOption">+ option</button>
      </template>

      <template v-if="f.type === 'list'">
        <div class="sub">Each item has</div>
        <FieldEditor v-for="it in f.itemFields ?? []" :key="it.key" :field="it" :path="[...path, it.key]" @remove="store.removeFieldAt([...path, it.key])" />
        <button class="link" @click="store.addItemFieldAt(path)">+ item field</button>
      </template>

      <template v-if="!nested && f.type !== 'list'">
        <div class="row"><span class="l">Starts as</span>
          <select v-if="f.type === 'enum'" :value="f.default ?? ''" @change="setDefault(($event.target as HTMLSelectElement).value)">
            <option value="">(first option)</option>
            <option v-for="o in f.options ?? []" :key="o.value" :value="o.value">{{ o.label }}</option>
          </select>
          <input v-else-if="f.type === 'boolean'" type="checkbox" :checked="f.default === true" @change="patch({ default: ($event.target as HTMLInputElement).checked })" />
          <input v-else-if="f.type === 'string' || f.type === 'number'" :type="f.type === 'number' ? 'number' : 'text'" :value="f.default ?? ''" @input="setDefault(($event.target as HTMLInputElement).value)" />
          <span v-else class="muted">— set at runtime —</span>
        </div>
        <label class="check"><input type="checkbox" :checked="f.persisted === true" @change="patch({ persisted: ($event.target as HTMLInputElement).checked || undefined })" /> Remember after restart</label>
        <div class="row top"><span class="l">Notes</span><textarea rows="2" spellcheck="true" :value="f.description ?? ''" placeholder="Anything the coding agent should know" @input="patch({ description: ($event.target as HTMLTextAreaElement).value || undefined })" /></div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.fe { border: 1px solid var(--line); border-radius: 6px; margin-bottom: 6px; background: var(--bg); font-size: 12px; }
.fe.nested { margin: 4px 0; background: var(--panel); }
.head { display: flex; align-items: center; gap: 6px; padding: 5px 8px; cursor: pointer; }
.caret { color: var(--muted); width: 10px; }
.key { font-family: ui-monospace, Consolas, monospace; }
.type { color: var(--muted); }
.grow { flex: 1; }
.used { color: var(--accent); font-size: 11px; }
.x { border: 0; background: none; color: var(--muted); cursor: pointer; padding: 0 2px; }
.body { padding: 2px 8px 8px; }
.row { display: grid; grid-template-columns: 70px 1fr; gap: 6px; align-items: center; margin: 4px 0; }
.row.top { align-items: start; }
.l, .sub, .muted { color: var(--muted); }
.sub { margin: 8px 0 3px; font-size: 11px; text-transform: uppercase; letter-spacing: .05em; }
.sub small { text-transform: none; letter-spacing: 0; }
select, input:not([type='checkbox']):not([type='color']), textarea { font: inherit; width: 100%; padding: 3px 6px; border: 1px solid var(--line); border-radius: 5px; background: var(--bg); color: var(--fg); }
.opt { display: grid; grid-template-columns: 28px 1fr 96px 18px; gap: 4px; align-items: start; margin: 3px 0; }
input[type='color'] { width: 28px; height: 24px; padding: 0; border: 1px solid var(--line); border-radius: 4px; background: none; }
.check { display: flex; gap: 6px; align-items: center; margin: 6px 0; }
.link { border: 0; background: none; color: var(--accent); cursor: pointer; font: inherit; padding: 3px 0; }
</style>
