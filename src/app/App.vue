<script setup lang="ts">
// Designer shell: left = palette / data / actions / JSON, center = canvas, right = inspector.
import { onBeforeUnmount, onMounted } from 'vue';
import { useProject } from '../store/project';
import Canvas from '../canvas/Canvas.vue';
import Palette from '../palette/Palette.vue';
import NodeInspector from '../inspector/NodeInspector.vue';
import ScreenInspector from '../inspector/ScreenInspector.vue';
import DataPanel from '../data/DataPanel.vue';
import ActionsPanel from '../data/ActionsPanel.vue';
import JsonPanel from '../data/JsonPanel.vue';
import CodePanel from '../data/CodePanel.vue';
import TopBar from './TopBar.vue';
import ProblemsBar from './ProblemsBar.vue';
import TemplateGallery from './TemplateGallery.vue';
import Tour from '../tour/Tour.vue';
import ExportDialog from '../export/ExportDialog.vue';
import DraftDialog from '../ai/DraftDialog.vue';
import { leftTab as tab, type LeftTab as Tab } from './ui';
import { loadDictionary } from '../spell/dictionary';

const store = useProject();
const TABS: { id: Tab; label: string }[] = [
  { id: 'add', label: 'Add' }, { id: 'data', label: 'Data' }, { id: 'actions', label: 'Actions' }, { id: 'code', label: 'Code' }, { id: 'json', label: 'JSON' },
];

function onKey(e: KeyboardEvent) {
  const t = e.target as HTMLElement;
  const typing = t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName);
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key.toLowerCase() === 'z' && !typing) { e.preventDefault(); if (e.shiftKey) store.redo(); else store.undo(); return; }
  if (mod && e.key.toLowerCase() === 'y' && !typing) { e.preventDefault(); store.redo(); return; }
  if (typing || !store.selectedId) return;
  if (e.altKey && e.key.startsWith('Arrow')) {
    e.preventDefault();
    const id = store.selectedId;
    if (e.key === 'ArrowUp') store.nudge(id, -1);
    else if (e.key === 'ArrowDown') store.nudge(id, 1);
    else if (e.key === 'ArrowRight') store.indent(id);
    else store.outdent(id);
    return;
  }
  if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); store.removeNode(store.selectedId); }
  else if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); store.duplicateNode(store.selectedId); }
  else if (e.key === 'Escape') store.select(null);
}
onMounted(() => {
  window.addEventListener('keydown', onKey);
  loadDictionary();
});
onBeforeUnmount(() => window.removeEventListener('keydown', onKey));
</script>

<template>
  <div class="app">
    <TopBar />
    <div v-if="store.restoreNote" class="note">{{ store.restoreNote }} <button @click="store.restoreNote = ''">OK</button></div>
    <div class="main" :class="{ wide: tab !== 'add' && tab !== 'code', code: tab === 'code' }">
      <aside class="left">
        <nav class="tabs">
          <button v-for="t in TABS" :key="t.id" :class="{ on: tab === t.id }" :data-tour="'tab-' + t.id" @click="tab = t.id">
            {{ t.label }}<small v-if="t.id === 'data'"> {{ store.project.state.length }}</small><small v-if="t.id === 'actions'"> {{ store.project.actions.length }}</small>
          </button>
        </nav>
        <div class="scroll">
          <Palette v-if="tab === 'add'" />
          <DataPanel v-else-if="tab === 'data'" />
          <ActionsPanel v-else-if="tab === 'actions'" />
          <CodePanel v-else-if="tab === 'code'" />
          <JsonPanel v-else />
        </div>
      </aside>
      <Canvas class="center" />
      <aside class="right scroll">
        <NodeInspector v-if="store.selected" :key="store.selected.node.id" :at="store.selected" />
        <ScreenInspector v-else />
      </aside>
    </div>
    <ProblemsBar />
    <TemplateGallery />
    <ExportDialog />
    <DraftDialog />
    <Tour />
  </div>
</template>

<style>
:root {
  --bg: #f4f6f9; --panel: #ffffff; --stage: #dde2ea; --fg: #0f172a; --muted: #64748b; --line: #dbe1ea;
  --accent: #2563eb; --ok: #15803d; --err: #c62828; --warn: #b45309; --container: #7c3aed;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme='light']) {
    --bg: #0d1424; --panel: #131c30; --stage: #070b14; --fg: #e2e8f0; --muted: #94a3b8; --line: #24304a;
    --accent: #60a5fa; --ok: #4ade80; --err: #f87171; --warn: #fbbf24; --container: #a78bfa;
  }
}
* { box-sizing: border-box; }
html, body, #app { height: 100%; margin: 0; }
body { background: var(--bg); color: var(--fg); font: 13px/1.45 system-ui, 'Segoe UI', sans-serif; }
</style>

<style scoped>
.app { display: flex; flex-direction: column; height: 100%; }
.note { background: color-mix(in srgb, var(--warn) 18%, var(--panel)); padding: 6px 12px; font-size: 12px; }
.main { flex: 1; display: grid; grid-template-columns: 250px minmax(0, 1fr) 300px; min-height: 0; }
.main.wide { grid-template-columns: 360px minmax(0, 1fr) 300px; }
.main.code { grid-template-columns: 520px minmax(0, 1fr) 300px; }
.left, .right { background: var(--panel); min-height: 0; display: flex; flex-direction: column; }
.left { border-right: 1px solid var(--line); }
.right { border-left: 1px solid var(--line); }
.scroll { overflow: auto; flex: 1; min-height: 0; }
.tabs { display: flex; border-bottom: 1px solid var(--line); }
.tabs button { flex: 1; font: inherit; font-size: 12px; padding: 8px 4px; border: 0; border-bottom: 2px solid transparent; background: none; color: var(--muted); cursor: pointer; }
.tabs button.on { color: var(--fg); border-bottom-color: var(--accent); font-weight: 600; }
.tabs small { color: var(--muted); font-weight: 400; margin-left: 4px; font-size: 10px; background: var(--bg); border-radius: 8px; padding: 0 5px; }
.center { min-height: 0; }
@media (max-width: 900px) {
  .main, .main.wide { grid-template-columns: 1fr; grid-template-rows: auto 1fr auto; overflow: auto; }
  .left, .right { max-height: 40vh; }
}
</style>
