<script setup lang="ts">
// "Describe a screen": the user writes what they want, Claude drafts it, the user previews
// and inserts (one undo step). The key is the viewer's own and stays in their browser.
import { computed, ref } from 'vue';
import { componentSpec } from '../spec/catalog';
import type { Node } from '../spec/types';
import { useProject } from '../store/project';
import { draftOpen } from '../app/ui';
import { loadKey, MODEL, saveKey } from './keys';
import { draftToNodes, type DraftResult } from './draft';

const store = useProject();
const description = ref('');
const mode = ref<'new-screen' | 'insert'>('new-screen');
const key = ref(loadKey());
const remember = ref(true);
const busy = ref(false);
const error = ref('');
const result = ref<DraftResult | null>(null);
let abort: AbortController | null = null;

const EXAMPLES = [
  'A hazard report form: hazard type dropdown, severity, location picked on the map, a photo, notes, and a Send button that drops a marker for the team.',
  'A medic roster with each person\'s callsign and a colored status badge, plus buttons for me to set my own status.',
  'Settings for a server connection: address, username, API key, a connect-on-startup switch, and a Test button.',
];

const canGo = computed(() => !!description.value.trim() && !!key.value.trim() && !busy.value);

async function generate() {
  error.value = '';
  result.value = null;
  busy.value = true;
  abort = new AbortController();
  saveKey(remember.value ? key.value.trim() : null);
  try {
    // the SDK loads on first use only, so people who never draft don't download it
    const { requestDraft } = await import('./client');
    const draft = await requestDraft(key.value.trim(), description.value, store.project, { signal: abort.signal });
    result.value = draftToNodes(draft, store.project);
  } catch (e) {
    const known = (e as Error).name === 'DraftError';
    error.value = known ? (e as Error).message : `Something went wrong: ${(e as Error).message}`;
    if (!known) console.warn('[takui] draft failed', e);
  } finally {
    busy.value = false;
    abort = null;
  }
}
function cancel() { abort?.abort(); }
function insert() {
  if (!result.value) return;
  store.applyDraft(result.value, mode.value);
  close();
}
function close() {
  if (busy.value) cancel();
  draftOpen.value = false;
  result.value = null;
  error.value = '';
}
function forget() {
  saveKey(null);
  key.value = '';
}

/** flat, indented outline of the drafted tree for the preview */
const outline = computed(() => {
  const rows: { depth: number; label: string; text: string; extra: string }[] = [];
  const go = (n: Node, depth: number) => {
    const spec = componentSpec(n.kind, n.type);
    const text = String(n.props.text ?? n.props.title ?? n.props.label ?? '');
    const extra = [n.bind ? `⇄ ${n.bind}` : '', ...Object.entries(n.on ?? {}).map(([e, a]) => `${e} → ${a}`)].filter(Boolean).join('  ');
    rows.push({ depth, label: spec?.label ?? n.type, text, extra });
    if (n.kind === 'container') for (const c of n.children) go(c, depth + 1);
  };
  for (const c of result.value?.root.children ?? []) go(c, 0);
  return rows;
});
</script>

<template>
  <div v-if="draftOpen" class="scrim" @click.self="close">
    <div class="dlg" role="dialog" aria-label="Describe a screen">
      <header>
        <h2>✨ Describe a screen</h2>
        <button class="x" aria-label="Close" @click="close">✕</button>
      </header>

      <template v-if="!result">
        <p class="muted">Say what the screen is for and what's on it, in plain words. Claude drafts it. You preview it, then insert and adjust.</p>
        <textarea v-model="description" rows="5" spellcheck="true" placeholder="e.g. A form to request supplies: item, quantity, where to deliver on the map, and a Send button…" :disabled="busy" />
        <div class="examples">
          <span class="muted">Try:</span>
          <button v-for="(ex, i) in EXAMPLES" :key="i" class="chip" :disabled="busy" @click="description = ex">{{ ex.split(':')[0] }}</button>
        </div>

        <div class="row">
          <label><input v-model="mode" type="radio" value="new-screen" :disabled="busy" /> As a new screen</label>
          <label><input v-model="mode" type="radio" value="insert" :disabled="busy" /> Add to the current screen{{ store.selected ? ' (at the selection)' : '' }}</label>
        </div>

        <details class="key" :open="!key">
          <summary>Anthropic API key {{ key ? '✓' : '(needed)' }}</summary>
          <input v-model="key" type="password" autocomplete="off" spellcheck="false" placeholder="sk-ant-…" :disabled="busy" />
          <label class="chk"><input v-model="remember" type="checkbox" /> Remember on this device</label>
          <button v-if="key" class="link" @click="forget">Forget key</button>
          <p class="muted small">Your key stays in this browser and is sent only to api.anthropic.com. Each draft is one {{ MODEL }} request (usually a few cents). Don't use a shared computer for a key you care about. Get a key at console.anthropic.com.</p>
        </details>

        <p v-if="error" class="err">{{ error }}</p>
        <div class="actions">
          <button v-if="busy" @click="cancel">Cancel</button>
          <button class="primary" :disabled="!canGo" @click="generate">{{ busy ? 'Drafting… (this can take a little while)' : '✨ Draft it' }}</button>
        </div>
      </template>

      <template v-else>
        <h3>{{ result.title }}</h3>
        <p class="muted">{{ result.count }} component{{ result.count === 1 ? '' : 's' }}<template v-if="result.newFields.length"> · new data fields: {{ result.newFields.map((f) => f.key).join(', ') }}</template><template v-if="result.newActions.length"> · new actions: {{ result.newActions.map((a) => a.label).join(', ') }}</template></p>
        <ul v-if="result.notes.length" class="notes"><li v-for="(n, i) in result.notes" :key="i">{{ n }}</li></ul>
        <ul class="outline">
          <li v-for="(r, i) in outline" :key="i" :style="{ paddingLeft: r.depth * 16 + 'px' }">
            <b>{{ r.label }}</b> <span v-if="r.text">"{{ r.text }}"</span> <code v-if="r.extra">{{ r.extra }}</code>
          </li>
        </ul>
        <div class="actions">
          <button @click="result = null">← Change description</button>
          <button @click="generate">Try again</button>
          <button class="primary" @click="insert">Insert {{ mode === 'new-screen' ? 'as a new screen' : 'here' }}</button>
        </div>
        <p class="muted small">You can undo the insert with Ctrl+Z.</p>
      </template>
    </div>
  </div>
</template>

<style scoped>
.scrim { position: fixed; inset: 0; background: rgba(0, 0, 0, .45); display: flex; align-items: center; justify-content: center; z-index: 50; padding: 16px; }
.dlg { background: var(--panel); color: var(--fg); border-radius: 10px; width: min(640px, 100%); max-height: 90vh; overflow: auto; padding: 16px 20px; box-shadow: 0 20px 60px rgba(0,0,0,.4); }
header { display: flex; justify-content: space-between; align-items: center; }
h2 { margin: 0; font-size: 18px; } h3 { margin: 4px 0; font-size: 15px; }
.x { border: 0; background: none; color: var(--muted); font-size: 16px; cursor: pointer; }
.muted { color: var(--muted); font-size: 13px; } .small { font-size: 11px; }
textarea, .key input[type='password'] { width: 100%; font: inherit; padding: 8px; border: 1px solid var(--line); border-radius: 6px; background: var(--bg); color: var(--fg); }
.examples { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; margin: 6px 0 10px; }
.chip { font: inherit; font-size: 12px; padding: 2px 9px; border: 1px solid var(--line); border-radius: 12px; background: var(--bg); color: var(--accent); cursor: pointer; }
.row { display: flex; gap: 16px; flex-wrap: wrap; font-size: 13px; margin-bottom: 8px; }
.key { border: 1px solid var(--line); border-radius: 6px; padding: 6px 10px; margin: 8px 0; font-size: 13px; }
.key summary { cursor: pointer; }
.key input[type='password'] { margin-top: 6px; }
.chk { display: inline-flex; gap: 6px; align-items: center; margin: 6px 12px 0 0; font-size: 12px; }
.link { border: 0; background: none; color: var(--err); cursor: pointer; font: inherit; font-size: 12px; padding: 0; }
.err { color: var(--err); font-size: 13px; }
.actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 12px; flex-wrap: wrap; }
button { font: inherit; font-size: 13px; padding: 7px 12px; border: 1px solid var(--line); border-radius: 6px; background: var(--bg); color: var(--fg); cursor: pointer; }
button:disabled { opacity: .5; cursor: default; }
.primary { background: var(--accent); border-color: var(--accent); color: #fff; font-weight: 600; }
.notes { margin: 6px 0; padding-left: 18px; font-size: 13px; color: var(--warn); }
.outline { list-style: none; padding: 8px; margin: 8px 0; border: 1px solid var(--line); border-radius: 6px; background: var(--bg); max-height: 40vh; overflow: auto; font-size: 13px; }
.outline li { padding: 2px 0; }
.outline code { font-size: 11px; color: var(--accent); }
</style>
