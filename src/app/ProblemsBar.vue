<script setup lang="ts">
// Bottom bar: validator issues + spelling. Clicking an issue jumps to what it's about.
import { computed, ref } from 'vue';
import { locate } from '../spec/tree';
import { useProject } from '../store/project';
import { dictionary } from '../spell/dictionary';
import SpellList from '../spell/SpellList.vue';
import { leftTab } from './ui';

const store = useProject();
const open = ref(false);
const errors = computed(() => store.issues.filter((i) => i.severity === 'error').length);
const warnings = computed(() => store.issues.length - errors.value);
const typos = computed(() => store.spelling.length);

function go(ref?: string, path = '') {
  if (ref && locate(store.project, ref)) return store.select(ref);
  if (ref && store.project.screens.some((s) => s.id === ref)) return store.selectScreen(ref);
  if (path.startsWith('/actions')) { leftTab.value = 'actions'; return; }
  if (path.startsWith('/state')) { leftTab.value = 'data'; return; }
  store.select(null); // project-level: the screen inspector shows meta + entry
}
</script>

<template>
  <footer class="pb" :class="{ open }" data-tour="problems">
    <button class="sum" @click="open = !open">
      <span v-if="!store.issues.length && !typos" class="ok">✓ No problems</span>
      <span v-if="errors" class="err">● {{ errors }} error{{ errors === 1 ? '' : 's' }}</span>
      <span v-if="warnings" class="warn">▲ {{ warnings }} warning{{ warnings === 1 ? '' : 's' }}</span>
      <span v-if="typos" class="typo">✎ {{ typos }} spelling</span>
      <span v-if="!dictionary" class="muted">(loading spell check…)</span>
      <span class="chev">{{ open ? '▾' : '▴' }}</span>
    </button>
    <div v-if="open && (store.issues.length || typos)" class="body">
      <ul>
        <li v-for="(i, k) in store.issues" :key="k" :class="i.severity" @click="go(i.ref, i.path)">
          <b>{{ i.severity === 'error' ? '●' : '▲' }}</b> {{ i.message }}
        </li>
      </ul>
      <template v-if="typos">
        <h5>Spelling <small>click a word for fixes</small></h5>
        <SpellList :items="store.spelling" show-where />
      </template>
    </div>
  </footer>
</template>

<style scoped>
.pb { border-top: 1px solid var(--line); background: var(--panel); font-size: 12px; }
.sum { display: flex; gap: 14px; align-items: center; width: 100%; padding: 5px 12px; border: 0; background: none; color: var(--fg); font: inherit; cursor: pointer; text-align: left; }
.chev { margin-left: auto; color: var(--muted); }
.ok { color: var(--ok); } .err, .error b { color: var(--err); } .warn, .warning b { color: var(--warn); } .typo { color: var(--accent); }
.muted { color: var(--muted); }
.body { max-height: 32vh; overflow: auto; padding: 0 12px 8px; }
ul { list-style: none; margin: 0; padding: 0; }
li { padding: 4px 0; cursor: pointer; } li:hover { background: var(--bg); }
h5 { margin: 10px 0 2px; font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); }
h5 small { text-transform: none; letter-spacing: 0; font-weight: 400; }
</style>
