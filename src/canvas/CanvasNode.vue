<script setup lang="ts">
// One node on the canvas: editor chrome (select, drag, issue outline, drop slots) around the
// skin's rendering. Containers are laid out here and styled by the skin's .c-* classes;
// elements are drawn by the skin's element component.
//
// mockup mode (export): no chrome, not interactive, rendered for an explicit `target`, and
// components hidden on that target are omitted rather than dimmed.
import { computed, ref, watch } from 'vue';
import { componentSpec } from '../spec/catalog';
import { contains } from '../spec/tree';
import { TARGET_NAMES } from '../spec/validate';
import type { ContainerNode, Node, Target } from '../spec/types';
import { useProject } from '../store/project';
import { resolveField, withOverrides, type PreviewCtx } from '../skins/preview';
import SkinElement from '../skins/SkinElement.vue';
import { previewTarget } from './view';
import DropSlot from './DropSlot.vue';
import { dragging, endDrag, startDrag } from './dnd';
import { locate } from '../spec/tree';

defineOptions({ name: 'CanvasNode' });
const props = defineProps<{ node: Node; ctx: PreviewCtx; ghost?: boolean; isRoot?: boolean; target?: Target; mockup?: boolean; tab?: number }>();
const tgt = computed<Target>(() => props.target ?? previewTarget.value);
const store = useProject();

const spec = computed(() => componentSpec(props.node.kind, props.node.type));
const selected = computed(() => !props.ghost && store.selectedId === props.node.id);
const nodeIssues = computed(() => (props.ghost ? [] : store.issuesByRef.get(props.node.id) ?? []));
const hasError = computed(() => nodeIssues.value.some((i) => i.severity === 'error'));
const hiddenHere = computed(() => props.node.targetOverrides?.[tgt.value]?.hidden === true);
/** props as the previewed platform sees them */
const eff = computed(() => withOverrides(props.node, tgt.value));

const c = computed(() => (props.node.kind === 'container' ? (props.node as ContainerNode) : undefined));
const horizontal = computed(() => c.value?.type === 'row');
const gap = computed(() => (typeof eff.value.props.gap === 'number' ? eff.value.props.gap : 8));
const alignMap: Record<string, string> = { start: 'flex-start', center: 'center', end: 'flex-end', stretch: 'stretch' };
const grid = computed(() => c.value?.type === 'grid');
const columns = computed(() => Math.max(1, Math.min(6, Math.round(Number(eff.value.props.columns ?? 2)) || 2)));
const layoutStyle = computed(() => (grid.value
  ? { display: 'grid', gridTemplateColumns: `repeat(${columns.value}, minmax(0, 1fr))`, gap: gap.value + 'px', alignItems: 'stretch' }
  : {
      gap: gap.value + 'px',
      alignItems: alignMap[String(eff.value.props.align ?? (horizontal.value ? 'center' : 'stretch'))],
      flexWrap: eff.value.props.wrap ? ('wrap' as const) : undefined,
    }));

// list: children are the row template, rendered against the list's item fields
const listField = computed(() => (c.value?.type === 'list' ? resolveField(props.ctx, c.value.bind) : undefined));
const childCtx = computed<PreviewCtx>(() =>
  c.value?.type === 'list' ? { ...props.ctx, item: listField.value?.type === 'list' ? listField.value : undefined, row: 0 } : props.ctx);

// tabs: show the tab that holds the selection, else whichever was clicked
const activeTab = ref(0);
watch(() => store.selectedId, (id) => {
  if (!id || c.value?.type !== 'tabs') return;
  const i = c.value.children.findIndex((ch) => contains(ch, id));
  if (i >= 0) activeTab.value = i;
}, { immediate: true });
/** mockup export pins every tabs block to `tab` so each tab gets its own image */
const tabIndex = computed(() => (props.mockup && props.tab !== undefined ? props.tab : activeTab.value));
const activeChild = computed(() => c.value?.children[Math.min(tabIndex.value, (c.value?.children.length ?? 1) - 1)]);

const collapsedPreview = ref(false);

function onClick() {
  if (!props.ghost) store.select(props.node.id);
}
function onDragStart(e: DragEvent) {
  e.stopPropagation();
  startDrag(e, { op: 'move', id: props.node.id });
}

// Forgiving drops: the slots between children are precise targets, but a drop anywhere
// else still lands somewhere sensible: onto a layout block = append inside it, onto a
// component = insert right after it. Slots stop propagation, so they win when hit.
const dropOver = ref(false);
watch(dragging, (d) => { if (!d) dropOver.value = false; });
function dropTarget(): { parentId: string; index: number } | undefined {
  if (props.ghost) return undefined;
  const n = props.node;
  if (n.kind === 'container' && n.type !== 'tabs') return { parentId: n.id, index: n.children.length };
  const at = locate(store.project, n.id);
  if (!at?.parent || at.parent.type === 'tabs') return undefined;
  return { parentId: at.parent.id, index: at.index + 1 };
}
function canDrop(): boolean {
  const d = dragging.value;
  const t = dropTarget();
  if (!d || !t) return false;
  return d.op === 'new' || (d.id !== props.node.id && store.canMove(d.id, t.parentId));
}
function onDragOver(e: DragEvent) {
  if (!canDrop()) return;
  e.preventDefault();
  e.stopPropagation();
  dropOver.value = true;
}
function onDrop(e: DragEvent) {
  dropOver.value = false;
  const d = dragging.value;
  const t = dropTarget();
  if (!d || !t || !canDrop()) return;
  e.preventDefault();
  e.stopPropagation();
  if (d.op === 'new') store.addNode(d.kind, d.type, t.parentId, t.index);
  else store.moveNode(d.id, t.parentId, t.index);
  endDrag();
}
</script>

<template>
  <div
    v-if="!(mockup && hiddenHere)"
    class="cn"
    :class="[node.kind, node.type, { selected, ghost, error: hasError, root: isRoot, hiddenHere, dropOver: dropOver && !!dragging }]"
    :draggable="!ghost && !isRoot"
    @click.stop="onClick"
    @dragstart="onDragStart"
    @dragend="endDrag"
    @dragover="onDragOver"
    @dragleave.self="dropOver = false"
    @drop="onDrop"
  >
    <span v-if="selected" class="tag">{{ spec?.label ?? node.type }} <code>#{{ node.id }}</code></span>
    <span v-if="!ghost && (node.visibleWhen || hiddenHere)" class="flags">
      <span v-if="node.visibleWhen" title="Only shown when this condition is true">👁 if {{ node.visibleWhen.key }}</span>
      <span v-if="hiddenHere">hidden on {{ TARGET_NAMES[tgt] }}</span>
    </span>

    <SkinElement v-if="eff.kind === 'element'" :node="eff" :ctx="ctx" />

    <template v-else-if="c">
      <!-- tabs -->
      <template v-if="c.type === 'tabs'">
        <div class="c-tabbar">
          <span v-for="(t, i) in c.children" :key="t.id" class="c-tab" :class="{ on: i === tabIndex }"
            @click.stop="activeTab = i; onClick()">{{ t.props.title || '(untitled)' }}</span>
          <span v-if="!ghost" class="c-tab add" title="Add a tab" @click.stop="store.addTab(c.id)">＋</span>
        </div>
        <CanvasNode v-if="activeChild" :key="activeChild.id" :node="activeChild" :ctx="ctx" :ghost="ghost" :target="target" :mockup="mockup" :tab="tab" />
      </template>

      <!-- everything else lays out its children with drop slots between them -->
      <div v-else :class="{ 'c-section': c.type === 'section' || c.type === 'collapsible' }">
        <div v-if="c.type === 'section' && eff.props.title" class="c-title">{{ eff.props.title }}</div>
        <div v-if="c.type === 'collapsible'" class="c-collapse-head" @click.stop="collapsedPreview = !collapsedPreview; onClick()">
          <span>{{ eff.props.title }}</span><span>{{ collapsedPreview ? '▸' : '▾' }}</span>
        </div>
        <div v-if="c.type === 'list' && !mockup" class="list-badge">⟳ Repeats for each item in <b>{{ c.bind || '(no list connected)' }}</b> — design one row</div>

        <div v-show="!collapsedPreview" class="layout" :class="{ row: horizontal, pad: c.type !== 'stack' || !isRoot }" :style="layoutStyle">
          <template v-if="!ghost">
            <DropSlot v-if="!c.children.length" :parent-id="c.id" :index="0" :horizontal="horizontal" empty />
            <!-- a grid skips the between-item slots (they'd take up cells); drops on a cell insert after it,
                 drops on the grid's edge append -->
            <template v-for="(child, i) in c.children" :key="child.id">
              <DropSlot v-if="!grid" :parent-id="c.id" :index="i" :horizontal="horizontal" />
              <CanvasNode :node="child" :ctx="childCtx" :class="{ 'c-list-row': c.type === 'list' }" />
            </template>
            <DropSlot v-if="c.children.length && !grid" :parent-id="c.id" :index="c.children.length" :horizontal="horizontal" />
          </template>
          <CanvasNode v-for="child in c.children" v-else :key="child.id" :node="child" :ctx="childCtx" ghost :target="target" :mockup="mockup" :tab="tab" />
        </div>

        <!-- two more sample rows so a list reads as a list; not editable -->
        <template v-if="c.type === 'list' && c.children.length">
          <div v-for="r in [1, 2]" :key="r" class="layout pad ghost-row c-list-row" :class="{ real: mockup }" :style="layoutStyle">
            <CanvasNode v-for="child in c.children" :key="child.id" :node="child" :ctx="{ ...childCtx, row: r }" ghost :target="target" :mockup="mockup" :tab="tab" />
          </div>
        </template>
      </div>
    </template>
  </div>
</template>

<style scoped>
.cn { position: relative; border-radius: 3px; outline: 1px solid transparent; outline-offset: 2px; }
.cn:not(.ghost):not(.root):hover { outline-color: rgba(255, 255, 255, .25); }
.cn.selected { outline: 2px solid #33b5e5 !important; z-index: 2; }
.cn.error:not(.selected) { outline: 1px dashed #ff6b6b; }
.cn.ghost { pointer-events: none; }
.cn.root { flex: 1 0 auto; }
.cn.dropOver.container { outline: 2px dashed #33b5e5; background: rgba(51, 181, 229, .06); }
.cn.dropOver.element { box-shadow: 0 3px 0 -1px #33b5e5; }
.cn.hiddenHere { opacity: .45; }
.cn[draggable='true'] { cursor: grab; }
.cn.element { display: flex; flex-direction: column; }
.cn.row > div > .layout, .layout.row { flex-direction: row; }
.layout { display: flex; flex-direction: column; min-width: 0; }
.layout.pad { padding: 8px; }
.layout.row > :deep(.cn) { min-width: 0; }
.tag { position: absolute; top: -18px; left: -2px; background: #33b5e5; color: #00151f; font: 600 10px/16px system-ui, sans-serif; padding: 0 6px; border-radius: 3px 3px 0 0; white-space: nowrap; z-index: 3; pointer-events: none; }
.tag code { font-weight: 400; color: #003244; }
.flags { position: absolute; top: -9px; right: 2px; display: flex; gap: 4px; z-index: 3; pointer-events: none; }
.flags span { background: #5a4300; color: #ffd75e; font: 10px/14px system-ui, sans-serif; padding: 0 5px; border-radius: 7px; }
.list-badge { font: 11px/1.4 system-ui, sans-serif; color: #9fd8ee; background: rgba(51, 181, 229, .1); padding: 4px 8px; border-bottom: 1px dashed rgba(51, 181, 229, .4); }
.ghost-row { opacity: .45; }
.ghost-row.real { opacity: 1; }
.c-tab.add { flex: 0 0 40px; color: #33b5e5; }
</style>
