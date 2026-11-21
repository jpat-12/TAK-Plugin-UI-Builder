<script setup lang="ts">
// Project file operations. "Save" = download a .takui.json: localStorage autosave is only
// this browser's scratch copy (static site, PLAN.md D6), the file is the real save.
import { ref } from 'vue';
import { loadProject } from '../spec/load';
import type { Project } from '../spec/types';
import { useProject } from '../store/project';
import { draftOpen, galleryOpen, signals } from './ui';
import { tourActive } from '../tour/state';
import { exportOpen } from '../export/state';

const store = useProject();
const fileInput = ref<HTMLInputElement | null>(null);
async function onOpen(e: Event) {
  const input = e.target as HTMLInputElement;
  const f = input.files?.[0];
  input.value = '';
  if (!f) return;
  const r = loadProject(await f.text());
  if (!r.ok) return alert(`Couldn't open ${f.name}:\n\n${r.issues.slice(0, 8).map((i) => '• ' + i.message).join('\n')}`);
  store.replaceProject(r.project as Project);
}
function onSave() {
  const p = store.project;
  const slug = (p.meta.name || 'plugin').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'plugin';
  const blob = new Blob([JSON.stringify(p, null, 2) + '\n'], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${slug}.takui.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  signals.value.saved = true;
}
</script>

<template>
  <header class="top">
    <span class="brand">TAK Plugin UI Builder</span>
    <span class="name">{{ store.project.meta.name || 'Untitled' }} <small>v{{ store.project.meta.version }}</small></span>
    <span class="spacer" />
    <button title="Take the 2-minute guided tour" @click="tourActive = true">Tour</button>
    <button @click="galleryOpen = true">New…</button>
    <button title="Describe a screen in words; Claude drafts it" @click="draftOpen = true">✨ Describe…</button>
    <button @click="fileInput?.click()">Open…</button>
    <input ref="fileInput" type="file" accept=".json,application/json" hidden @change="onOpen" />
    <button data-tour="save" title="Download the project as a .takui.json file" @click="onSave">Save file</button>
    <button class="primary" data-tour="export" title="Build the handoff package for a coding agent" @click="exportOpen = true">Export for agent…</button>
    <span class="sep" />
    <button :disabled="!store.canUndo" title="Undo (Ctrl+Z)" @click="store.undo()">↶</button>
    <button :disabled="!store.canRedo" title="Redo (Ctrl+Y)" @click="store.redo()">↷</button>
  </header>
</template>

<style scoped>
.top { display: flex; align-items: center; gap: 6px; padding: 6px 12px; border-bottom: 1px solid var(--line); background: var(--panel); }
.brand { font-weight: 700; font-size: 14px; }
.name { color: var(--muted); font-size: 13px; margin-left: 10px; }
.spacer { flex: 1; }
.sep { width: 1px; height: 20px; background: var(--line); margin: 0 4px; }
button, select { font: inherit; font-size: 12px; padding: 5px 10px; border: 1px solid var(--line); border-radius: 6px; background: var(--bg); color: var(--fg); cursor: pointer; }
button:disabled { opacity: .4; cursor: default; }
.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
@media (max-width: 700px) { .brand, .name { display: none; } }
</style>
