// Native HTML5 drag-and-drop, not vuedraggable: vuedraggable mutates the bound arrays
// directly, which would bypass the store's mutate() (and with it undo + autosave).
// Drops call store.addNode/moveNode instead.
//
// dataTransfer can't be read during dragover (browser security), so the payload is also
// kept in a module-level ref that drop slots read to decide whether to accept.

import { ref } from 'vue';

export type DragPayload =
  | { op: 'new'; kind: 'container' | 'element'; type: string }
  | { op: 'move'; id: string };

const MIME = 'application/x-takui';
export const dragging = ref<DragPayload | null>(null);

export function startDrag(e: DragEvent, payload: DragPayload) {
  dragging.value = payload;
  if (e.dataTransfer) {
    e.dataTransfer.setData(MIME, JSON.stringify(payload));
    e.dataTransfer.setData('text/plain', payload.op === 'new' ? payload.type : payload.id); // Firefox needs some data
    e.dataTransfer.effectAllowed = payload.op === 'new' ? 'copy' : 'move';
  }
}

export function endDrag() {
  dragging.value = null;
}
