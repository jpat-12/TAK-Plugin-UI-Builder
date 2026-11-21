<script setup lang="ts">
// Palette over spec/catalog.ts. Drag onto the canvas, or click to add at the selection
// (click works on touch screens, where HTML5 drag-and-drop doesn't).
import { computed, ref } from 'vue';
import { CONTAINERS, ELEMENTS, type Category, type ComponentSpec } from '../spec/catalog';
import { useProject } from '../store/project';
import { endDrag, startDrag } from '../canvas/dnd';

const store = useProject();
const q = ref('');

const GROUPS: { cat: Category; label: string }[] = [
  { cat: 'layout', label: 'Layout' },
  { cat: 'tak', label: 'TAK' },
  { cat: 'input', label: 'Inputs' },
  { cat: 'text', label: 'Text' },
  { cat: 'display', label: 'Display' },
  { cat: 'data', label: 'Lists & tables' },
];

type Item = { kind: 'container' | 'element'; type: string; spec: ComponentSpec };
const items: Item[] = [
  ...Object.entries(CONTAINERS).map(([type, spec]) => ({ kind: 'container' as const, type, spec })),
  ...Object.entries(ELEMENTS).map(([type, spec]) => ({ kind: 'element' as const, type, spec })),
];

const groups = computed(() => {
  const term = q.value.trim().toLowerCase();
  return GROUPS.map((g) => ({
    ...g,
    items: items.filter((i) => i.spec.category === g.cat && (!term || `${i.spec.label} ${i.type} ${i.spec.description}`.toLowerCase().includes(term))),
  })).filter((g) => g.items.length);
});

const targetsWarn = (i: Item) => store.project.meta.targets.filter((t) => i.spec.support[t] === 'approx' || i.spec.support[t] === 'none');

function add(i: Item) {
  const at = store.insertionPoint();
  store.addNode(i.kind, i.type, at.parentId, at.index);
}
</script>

<template>
  <div class="palette">
    <input v-model="q" class="search" type="search" placeholder="Search components…" aria-label="Search components" />
    <section v-for="g in groups" :key="g.cat">
      <h4>{{ g.label }}</h4>
      <button
        v-for="i in g.items"
        :key="i.type"
        class="item"
        :class="i.kind"
        draggable="true"
        :data-tour="'pal-' + i.type"
        :title="i.spec.description + (targetsWarn(i).length ? `\n\nApproximate on: ${targetsWarn(i).join(', ')}` : '')"
        @dragstart="startDrag($event, { op: 'new', kind: i.kind, type: i.type })"
        @dragend="endDrag"
        @click="add(i)"
      >
        {{ i.spec.label }}<span v-if="targetsWarn(i).length" class="approx" aria-label="approximate on a selected platform">≈</span>
      </button>
    </section>
    <p class="hint">Drag onto the screen, or click to add inside the selected layout block.</p>
  </div>
</template>

<style scoped>
.palette { padding: 8px; }
.search { width: 100%; font: inherit; padding: 6px 8px; border: 1px solid var(--line); border-radius: 6px; background: var(--bg); color: var(--fg); margin-bottom: 4px; }
h4 { margin: 10px 2px 4px; font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); }
section { display: flex; flex-wrap: wrap; gap: 4px; }
h4 { width: 100%; }
.item { font: 12px/1.2 system-ui, sans-serif; padding: 6px 8px; border: 1px solid var(--line); border-radius: 6px; background: var(--bg); color: var(--fg); cursor: grab; text-align: left; }
.item:hover { border-color: var(--accent); }
.item.container { border-left: 3px solid var(--container); }
.approx { margin-left: 4px; color: var(--warn); }
.hint { font-size: 11px; color: var(--muted); margin: 12px 2px 0; }
</style>
