<script setup lang="ts">
// "New…" dialog: blank project, starter templates, examples.
import { computed } from 'vue';
import { newProject } from '../spec/factory';
import { loadProject } from '../spec/load';
import type { Project } from '../spec/types';
import { useProject } from '../store/project';
import { TEMPLATES, type Template } from '../templates';
import { galleryOpen } from './ui';

const store = useProject();
const groups = computed(() => (['Start from', 'Examples'] as const).map((g) => ({ g, items: TEMPLATES.filter((t) => t.group === g) })));

/** Only ask when there's something to lose (the replace is undoable either way) */
function isEmpty(p: Project) {
  return p.state.length === 0 && p.actions.length === 0 && p.screens.every((s) => s.root.children.length === 0);
}
function use(p: Project) {
  if (!isEmpty(store.project) && !confirm('Replace the current project? You can undo with Ctrl+Z, or Save file first.')) return;
  store.replaceProject(p);
  galleryOpen.value = false;
}
function useTemplate(t: Template) {
  const r = loadProject(t.raw);
  if (r.ok) use(r.project);
}
</script>

<template>
  <div v-if="galleryOpen" class="scrim" @click.self="galleryOpen = false">
    <div class="gallery" role="dialog" aria-label="New project">
      <header>
        <h2>New project</h2>
        <button class="x" aria-label="Close" @click="galleryOpen = false">✕</button>
      </header>
      <div class="grid">
        <button class="card blank" @click="use(newProject())">
          <span class="icon">＋</span><b>Blank</b><small>An empty screen. Build it yourself.</small>
        </button>
      </div>
      <template v-for="grp in groups" :key="grp.g">
        <h3>{{ grp.g }}</h3>
        <div class="grid">
          <button v-for="t in grp.items" :key="t.id" class="card" :data-tour="'tpl-' + t.id" @click="useTemplate(t)">
            <span class="icon">{{ t.icon }}</span><b>{{ t.name }}</b><small>{{ t.blurb }}</small>
          </button>
        </div>
      </template>
      <p class="muted">Templates are starting points. Change anything. Every template opens with no problems.</p>
    </div>
  </div>
</template>

<style scoped>
.scrim { position: fixed; inset: 0; background: rgba(0, 0, 0, .45); display: flex; align-items: center; justify-content: center; z-index: 50; padding: 16px; }
.gallery { background: var(--panel); color: var(--fg); border-radius: 10px; width: min(760px, 100%); max-height: 90vh; overflow: auto; padding: 16px 20px; box-shadow: 0 20px 60px rgba(0,0,0,.4); }
header { display: flex; justify-content: space-between; align-items: center; }
h2 { margin: 0; font-size: 18px; } h3 { margin: 16px 0 8px; font-size: 12px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); }
.x { border: 0; background: none; color: var(--muted); font-size: 16px; cursor: pointer; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 8px; margin-top: 8px; }
.card { display: grid; grid-template-columns: 34px 1fr; grid-template-rows: auto auto; column-gap: 8px; text-align: left; font: inherit; padding: 10px; border: 1px solid var(--line); border-radius: 8px; background: var(--bg); color: var(--fg); cursor: pointer; }
.card:hover { border-color: var(--accent); }
.icon { grid-row: span 2; font-size: 22px; line-height: 34px; text-align: center; }
.card small { color: var(--muted); font-size: 12px; }
.blank .icon { color: var(--accent); }
.muted { color: var(--muted); font-size: 12px; margin-top: 14px; }
</style>
