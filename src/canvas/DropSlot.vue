<script setup lang="ts">
// A drop target between two children of a container (or the only one in an empty container).
import { computed, ref } from 'vue';
import { useProject } from '../store/project';
import { dragging, endDrag } from './dnd';

const props = defineProps<{ parentId: string; index: number; horizontal?: boolean; empty?: boolean }>();
const store = useProject();
const over = ref(false);

const accepts = computed(() => {
  const d = dragging.value;
  if (!d) return false;
  return d.op === 'new' || store.canMove(d.id, props.parentId);
});

function onOver(e: DragEvent) {
  if (!accepts.value) return;
  e.preventDefault();
  over.value = true;
}
function onDrop(e: DragEvent) {
  over.value = false;
  const d = dragging.value;
  if (!d || !accepts.value) return;
  e.preventDefault();
  e.stopPropagation();
  if (d.op === 'new') store.addNode(d.kind, d.type, props.parentId, props.index);
  else store.moveNode(d.id, props.parentId, props.index);
  endDrag();
}
</script>

<template>
  <div
    class="slot"
    :class="{ h: horizontal, empty, active: accepts, over }"
    @dragover="onOver"
    @dragleave="over = false"
    @drop="onDrop"
  >
    <span v-if="empty">{{ accepts ? 'Drop here' : 'Empty: drag components here, or click one in the palette' }}</span>
  </div>
</template>

<style scoped>
.slot { flex: 0 0 auto; min-height: 4px; margin: -2px 0; border-radius: 3px; transition: min-height .1s, background .1s; position: relative; z-index: 1; }
.slot.h { min-width: 4px; min-height: auto; margin: 0 -2px; align-self: stretch; }
.slot.active { min-height: 14px; margin: 0; background: rgba(51, 181, 229, .12); outline: 1px dashed rgba(51, 181, 229, .5); }
.slot.h.active { min-width: 14px; min-height: auto; }
.slot.over { background: rgba(51, 181, 229, .45); outline: 2px solid #33b5e5; }
.slot.empty { min-height: 44px; margin: 0; display: flex; align-items: center; justify-content: center; text-align: center;
  font-size: 12px; color: #8a8a8a; border: 1px dashed #4a4a4a; padding: 6px; }
.slot.empty.h { min-width: 120px; }
</style>
