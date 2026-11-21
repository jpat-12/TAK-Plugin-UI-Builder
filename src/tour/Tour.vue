<script setup lang="ts">
// Guided tour overlay: a step card plus a spotlight ring around the step's target. The ring
// never blocks clicks (pointer-events: none) because the user does every step for real.
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { newProject } from '../spec/factory';
import { useProject } from '../store/project';
import { leftTab, signals } from '../app/ui';
import { previewTarget } from '../canvas/view';
import { STEPS } from './steps';
import Demo from './Demo.vue';
import { tourActive } from './state';

const store = useProject();
const i = ref(0);
const done = ref(false);
const step = computed(() => STEPS[i.value]!);
const text = computed(() => (typeof step.value.text === 'function' ? step.value.text(store) : step.value.text));
const selector = computed(() => (typeof step.value.target === 'function' ? step.value.target(store) : step.value.target));

// "Show me" animation: auto-plays whenever the step (or its state-dependent demo) changes,
// rests after a few loops, and replays from the card button
const demo = computed(() => (typeof step.value.demo === 'function' ? step.value.demo(store) : step.value.demo));
const demoSig = computed(() => `${i.value}:${JSON.stringify(demo.value ?? null)}`);
const run = ref(0);
const playing = ref(true);
watch(demoSig, () => { playing.value = true; });
function showMe() {
  run.value++;
  playing.value = true;
}

// spotlight follows the target as panels scroll/resize
const rect = ref<DOMRect | null>(null);
let raf = 0;
function track() {
  const el = selector.value ? document.querySelector(selector.value) : null;
  rect.value = el ? el.getBoundingClientRect() : null;
  raf = requestAnimationFrame(track);
}
watch(tourActive, (on) => {
  cancelAnimationFrame(raf);
  if (on) track();
}, { immediate: true });
onBeforeUnmount(() => cancelAnimationFrame(raf));

// auto-advance when the step's check passes
let timer: ReturnType<typeof setTimeout> | undefined;
// keyed on the step index too: a step whose check is already true on arrival must still fire
watch(() => [i.value, tourActive.value && !!step.value.check?.(store)] as const, ([, ok]) => {
  clearTimeout(timer);
  done.value = ok;
  if (ok) timer = setTimeout(next, 900);
}, { immediate: true });

function start() {
  // the tour builds from a blank project; replaceProject is undoable
  if (store.project.state.length || store.project.screens.some((s) => s.root.children.length)) {
    if (!confirm('The tour starts from a blank project. Replace the current one? (Ctrl+Z undoes this.)')) { tourActive.value = false; return; }
  }
  store.replaceProject(newProject());
  leftTab.value = 'add';
  previewTarget.value = 'atak';
  signals.value.saved = false;
  next();
}
function next() {
  clearTimeout(timer);
  if (i.value < STEPS.length - 1) i.value++;
}
function back() {
  if (i.value > 1) i.value--;
}
function end() {
  tourActive.value = false;
  i.value = 0;
  try { localStorage.setItem('takui:toured', '1'); } catch { /* per-viewer convenience */ }
}
</script>

<template>
  <template v-if="tourActive">
    <Demo v-if="demo && playing && !done" :key="demoSig + ':' + run" :demo="demo" @finished="playing = false" />
    <div v-if="rect" class="ring" :style="{ left: rect.left - 6 + 'px', top: rect.top - 6 + 'px', width: rect.width + 12 + 'px', height: rect.height + 12 + 'px' }" />
    <aside class="card" role="dialog" aria-live="polite" :aria-label="step.title">
      <div class="progress"><i :style="{ width: (i / (STEPS.length - 1)) * 100 + '%' }" /></div>
      <h3>{{ step.title }} <span v-if="done" class="tick">✓</span></h3>
      <p>{{ text }}</p>
      <div class="btns">
        <template v-if="i === 0">
          <button class="primary" @click="start">Start the tour</button>
          <button @click="end">Not now</button>
        </template>
        <template v-else-if="i === STEPS.length - 1">
          <button class="primary" @click="end">Finish</button>
        </template>
        <template v-else>
          <button :disabled="i <= 1" @click="back">Back</button>
          <button v-if="demo && !done" class="show" @click="showMe">▶ Show me</button>
          <button v-if="!step.check" class="primary" @click="next">Next</button>
          <button v-else class="ghost" @click="next">Skip step</button>
          <button class="ghost end" @click="end">End tour</button>
        </template>
      </div>
    </aside>
  </template>
</template>

<style scoped>
.ring { position: fixed; z-index: 60; border: 3px solid #f59e0b; border-radius: 8px; pointer-events: none;
  box-shadow: 0 0 0 4px rgba(245, 158, 11, .25); animation: pulse 1.4s ease-in-out infinite; transition: all .15s; }
@keyframes pulse { 50% { box-shadow: 0 0 0 10px rgba(245, 158, 11, .08); } }
.card { position: fixed; z-index: 61; left: 50%; bottom: 44px; transform: translateX(-50%); width: min(420px, calc(100vw - 32px));
  background: var(--panel); color: var(--fg); border: 1px solid #f59e0b; border-radius: 10px; padding: 12px 14px 10px; box-shadow: 0 12px 40px rgba(0,0,0,.35); }
.progress { height: 3px; background: var(--line); border-radius: 2px; margin-bottom: 8px; overflow: hidden; }
.progress i { display: block; height: 100%; background: #f59e0b; transition: width .3s; }
h3 { margin: 0 0 4px; font-size: 14px; } .tick { color: var(--ok); }
p { margin: 0 0 10px; font-size: 13px; line-height: 1.5; }
.btns { display: flex; gap: 6px; }
button { font: inherit; font-size: 12px; padding: 5px 12px; border: 1px solid var(--line); border-radius: 6px; background: var(--bg); color: var(--fg); cursor: pointer; }
button:disabled { opacity: .4; cursor: default; }
.primary { background: #f59e0b; border-color: #f59e0b; color: #1f1300; font-weight: 600; }
.show { border-color: #f59e0b; color: #b45309; font-weight: 600; }
.ghost { border-color: transparent; background: none; color: var(--muted); }
.end { margin-left: auto; }
</style>
