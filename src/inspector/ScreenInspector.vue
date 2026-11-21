<script setup lang="ts">
// Inspector when nothing is selected: the current screen, then project-wide settings.
import { computed } from 'vue';
import { SURFACES, TARGETS, type Surface } from '../spec/types';
import { TARGET_NAMES } from '../spec/validate';
import { useProject } from '../store/project';
import CommitField from './CommitField.vue';

const store = useProject();
const s = computed(() => store.screen);
const meta = computed(() => store.project.meta);
const SURFACE_WORDS: Record<Surface, string> = { pane: 'Pane (side panel)', dialog: 'Dialog (pop-up)', settings: 'Settings page' };

const commitPackage = (v: string) => /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/.test(v) && (store.updateMeta({ packageId: v }), true);
const commitVersion = (v: string) => /^\d+\.\d+\.\d+$/.test(v) && (store.updateMeta({ version: v }), true);
</script>

<template>
  <div class="si">
    <h3>Screen</h3>
    <div class="row"><span class="l">Title</span><input :value="s.title" @input="store.updateScreen(s.id, { title: ($event.target as HTMLInputElement).value })" /></div>
    <div class="row"><span class="l">Id</span><CommitField :value="s.id" mono :commit="(v) => store.renameScreen(s.id, v)" /></div>
    <div class="row"><span class="l">Shown as</span>
      <select :value="s.surface" @change="store.updateScreen(s.id, { surface: ($event.target as HTMLSelectElement).value as Surface })">
        <option v-for="x in SURFACES" :key="x" :value="x">{{ SURFACE_WORDS[x] }}</option>
      </select>
    </div>
    <div class="buttons">
      <button v-if="store.project.entry.openScreen !== s.id" @click="store.updateEntry({ openScreen: s.id })">Open this from the launch button</button>
      <span v-else class="ok">▶ The launch button opens this screen</span>
      <button v-if="store.project.screens.length > 1" class="danger" @click="store.removeScreen(s.id)">Delete screen</button>
    </div>

    <h3>Plugin</h3>
    <div class="row" data-tour="plugin-name"><span class="l">Name</span><input :value="meta.name" spellcheck="true" @input="store.updateMeta({ name: ($event.target as HTMLInputElement).value })" /></div>
    <div class="row"><span class="l">Package id</span><CommitField :value="meta.packageId" mono hint="Lowercase, dot-separated, like org.ilwg.myplugin" :commit="commitPackage" /></div>
    <div class="row"><span class="l">Version</span><CommitField :value="meta.version" mono hint="Like 1.0.0" :commit="commitVersion" /></div>
    <div class="row top"><span class="l">Description</span><textarea rows="3" :value="meta.description" placeholder="What does this plugin do, and for whom?" @input="store.updateMeta({ description: ($event.target as HTMLTextAreaElement).value })" /></div>
    <div class="row top" data-tour="platforms"><span class="l">Platforms</span>
      <div class="targets">
        <label v-for="t in TARGETS" :key="t">
          <input type="checkbox" :checked="meta.targets.includes(t)" :disabled="meta.targets.length === 1 && meta.targets.includes(t)" @change="store.toggleTarget(t)" />
          {{ TARGET_NAMES[t] }}
        </label>
      </div>
    </div>

    <h3>Project dictionary</h3>
    <p v-if="!(meta.spellingAllow ?? []).length" class="muted">Words you add from spelling suggestions show up here. They're saved in the project file, so your team shares them.</p>
    <div v-else class="dict">
      <span v-for="w in meta.spellingAllow" :key="w" class="w">{{ w }}<button title="Remove" @click="store.updateMeta({ spellingAllow: meta.spellingAllow!.filter((x) => x !== w) })">✕</button></span>
    </div>

    <h3>Launch button</h3>
    <div class="row"><span class="l">Label</span><input :value="store.project.entry.label" @input="store.updateEntry({ label: ($event.target as HTMLInputElement).value })" /></div>
    <div class="row"><span class="l">Icon idea</span><input :value="store.project.entry.icon ?? ''" placeholder="e.g. ambulance, clipboard" @input="store.updateEntry({ icon: ($event.target as HTMLInputElement).value || undefined })" /></div>
    <p class="muted">On ATAK this is the toolbar tool. CloudTAK puts it in the home menu, WinTAK in the ribbon, and TAKX on its toolbar.</p>
  </div>
</template>

<style scoped>
.si { padding: 10px 12px; font-size: 13px; }
h3 { margin: 16px 0 6px; font-size: 13px; } h3:first-child { margin-top: 0; }
.row { display: grid; grid-template-columns: 90px 1fr; gap: 6px; align-items: center; margin: 5px 0; }
.row.top { align-items: start; }
.l { color: var(--muted); font-size: 12px; }
select, input:not([type='checkbox']), textarea { font: inherit; font-size: 12px; width: 100%; padding: 4px 6px; border: 1px solid var(--line); border-radius: 5px; background: var(--bg); color: var(--fg); }
.targets { display: flex; flex-direction: column; gap: 2px; font-size: 12px; }
.targets small { color: var(--muted); }
.buttons { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; margin: 8px 0; }
button { font: inherit; font-size: 12px; padding: 5px 10px; border: 1px solid var(--line); border-radius: 6px; background: var(--panel); color: var(--fg); cursor: pointer; }
.danger { color: var(--err); } .ok { color: var(--ok); font-size: 12px; }
.muted { color: var(--muted); font-size: 11px; }
.dict { display: flex; flex-wrap: wrap; gap: 4px; }
.w { font-size: 12px; border: 1px solid var(--line); border-radius: 10px; padding: 1px 4px 1px 8px; }
.w button { border: 0; padding: 0 2px; margin-left: 2px; background: none; color: var(--muted); }
</style>
