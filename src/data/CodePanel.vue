<script setup lang="ts">
// Live view of the generated code (PLAN.md Phase 3): pick a platform, browse its files.
// Regenerated from the project on every change, never edited here (the spec is the source).
import { computed, ref, watch } from 'vue';
import JSZip from 'jszip';
import { EMITTERS } from '../emit';
import { slugOf } from '../export/package';
import { TARGET_NAMES } from '../spec/validate';
import type { Target } from '../spec/types';
import { useProject } from '../store/project';

const store = useProject();
const targets = computed(() => store.project.meta.targets.filter((t) => EMITTERS[t]));
const target = ref<Target | undefined>(targets.value[0]);
watch(targets, (ts) => { if (!target.value || !ts.includes(target.value)) target.value = ts[0]; });

const files = computed(() => (target.value ? EMITTERS[target.value]!(store.project) : {}));
const paths = computed(() => Object.keys(files.value).sort((a, b) => (a === 'SCAFFOLD.md' ? -1 : b === 'SCAFFOLD.md' ? 1 : a.localeCompare(b))));
const open = ref('SCAFFOLD.md');
watch(paths, (ps) => { if (!ps.includes(open.value)) open.value = ps[0] ?? ''; });
const short = (path: string) => path.replace(/^app\/src\/main\/(java\/.*?\/ui\/|res\/)/, (_m, g: string) => (g.startsWith('java') ? 'java/…/' : 'res/'));

async function download() {
  if (!target.value) return;
  const zip = new JSZip();
  const dir = zip.folder(`${slugOf(store.project)}-${target.value}-scaffold`)!;
  for (const [p, body] of Object.entries(files.value)) dir.file(p, body);
  const blob = await zip.generateAsync({ type: 'blob' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${slugOf(store.project)}-${target.value}-scaffold.zip`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
</script>

<template>
  <div class="panel">
    <p class="intro">The code generated from your design. It updates as you edit and is included in the handoff zip. Read-only: change the design, not the code.</p>
    <p v-if="!targets.length" class="muted">No code generator for {{ store.project.meta.targets.map((t) => TARGET_NAMES[t]).join(', ') }} yet.</p>
    <template v-else>
      <div class="bar">
        <span class="seg">
          <button v-for="t in targets" :key="t" :class="{ on: t === target }" @click="target = t">{{ TARGET_NAMES[t] }}</button>
        </span>
        <button class="dl" title="Download just this platform's generated code" @click="download">⬇ .zip</button>
      </div>
      <ul class="files">
        <li v-for="p in paths" :key="p" :class="{ on: p === open }" :title="p" @click="open = p">{{ short(p) }}</li>
      </ul>
      <pre class="code">{{ files[open] }}</pre>
    </template>
  </div>
</template>

<style scoped>
.panel { padding: 8px; display: flex; flex-direction: column; height: 100%; font-size: 12px; }
.intro { color: var(--muted); margin: 2px 2px 8px; }
.muted { color: var(--muted); }
.bar { display: flex; gap: 6px; align-items: center; margin-bottom: 6px; }
.seg { display: inline-flex; border: 1px solid var(--line); border-radius: 6px; overflow: hidden; }
.seg button { font: inherit; padding: 4px 9px; border: 0; background: var(--panel); color: var(--muted); cursor: pointer; }
.seg button + button { border-left: 1px solid var(--line); }
.seg button.on { background: var(--accent); color: #fff; }
.dl { margin-left: auto; font: inherit; padding: 4px 9px; border: 1px solid var(--line); border-radius: 6px; background: var(--panel); color: var(--fg); cursor: pointer; }
.files { list-style: none; margin: 0 0 6px; padding: 4px; max-height: 30%; overflow: auto; border: 1px solid var(--line); border-radius: 6px; background: var(--bg); }
.files li { padding: 2px 6px; border-radius: 4px; cursor: pointer; font-family: ui-monospace, Consolas, monospace; font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.files li.on { background: var(--accent); color: #fff; }
.code { flex: 1; min-height: 200px; margin: 0; overflow: auto; padding: 8px; background: var(--bg); border: 1px solid var(--line); border-radius: 6px; font: 11px/1.45 ui-monospace, Consolas, monospace; white-space: pre; }
</style>
