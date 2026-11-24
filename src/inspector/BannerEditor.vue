<script setup lang="ts">
// "Home banner": a branded header (plugin name + logos) above the home screen's content.
import { computed, ref } from 'vue';
import { isHex } from '../spec/color';
import type { Banner, BannerLogo } from '../spec/types';
import { useProject } from '../store/project';
import { logoFromFile } from './icon';

const store = useProject();
const b = computed<Banner | undefined>(() => store.project.banner);
const hasIcon = computed(() => !!store.project.entry.iconImage);
const err = ref('');

type Side = 'left' | 'right';
/** A sensible logo for a side that is being switched on: the launch icon */
const defaultLogo = (): BannerLogo => 'icon';

const LAYOUTS: { id: string; label: string; left: boolean; right: boolean }[] = [
  { id: 'l', label: 'Logo left', left: true, right: false },
  { id: 'r', label: 'Logo right', left: false, right: true },
  { id: 'lr', label: 'Both sides', left: true, right: true },
  { id: 'n', label: 'Text only', left: false, right: false },
];
const layoutOn = (l: (typeof LAYOUTS)[number]) => !!b.value && (b.value.left !== undefined) === l.left && (b.value.right !== undefined) === l.right;
function setLayout(l: (typeof LAYOUTS)[number]) {
  const cur = b.value ?? {};
  // keep a logo already chosen for a side; moving from one side to the other carries it over
  const only = cur.left ?? cur.right;
  store.updateBanner({
    left: l.left ? (cur.left ?? only ?? defaultLogo()) : undefined,
    right: l.right ? (cur.right ?? only ?? defaultLogo()) : undefined,
  });
}

const kindOf = (l: BannerLogo | undefined) => (l === undefined ? 'none' : l === 'icon' ? 'icon' : 'image');
const fileFor = ref<Side | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);
function setKind(side: Side, kind: string) {
  err.value = '';
  if (kind === 'none') store.updateBanner({ [side]: undefined });
  else if (kind === 'icon') store.updateBanner({ [side]: 'icon' });
  else pick(side);
}
function pick(side: Side) {
  fileFor.value = side;
  fileInput.value?.click();
}
async function onFile(f: File | undefined) {
  const side = fileFor.value;
  if (!f || !side) return;
  try {
    store.updateBanner({ [side]: await logoFromFile(f) });
    err.value = '';
  } catch (e) {
    err.value = (e as Error).message;
  }
}

const bgDraft = ref<string | null>(null);
function commitBg(v: string) {
  const hex = v.trim().startsWith('#') ? v.trim() : '#' + v.trim();
  if (isHex(hex)) store.updateBanner({ background: hex.toLowerCase() });
  bgDraft.value = null;
}
const bgFallback = computed(() => store.project.theme?.header ?? '#2e2e2e');
</script>

<template>
  <div class="be" data-tour="banner">
    <h3>Home banner</h3>
    <label class="chk">
      <input type="checkbox" :checked="!!b" @change="($event.target as HTMLInputElement).checked ? store.updateBanner({ left: hasIcon ? 'icon' : undefined }) : store.updateBanner(null)" />
      Show a banner with your plugin's name and logo
    </label>

    <template v-if="b">
      <div class="layouts">
        <button v-for="l in LAYOUTS" :key="l.id" class="lay" :class="{ on: layoutOn(l) }" @click="setLayout(l)">
          <span class="mini" :class="{ c: b.align === 'center' }"><i v-if="l.left" class="lg" /><span class="ln"><s /><s class="sm" /></span><i v-if="l.right" class="lg" /></span>
          {{ l.label }}
        </button>
      </div>

      <div v-for="side in (['left', 'right'] as const)" :key="side" class="row">
        <span class="l">{{ side === 'left' ? 'Left logo' : 'Right logo' }}</span>
        <div class="logo">
          <select :value="kindOf(b[side])" @change="setKind(side, ($event.target as HTMLSelectElement).value)">
            <option value="none">None</option>
            <option value="icon">Launch icon{{ hasIcon ? '' : ' (not uploaded yet)' }}</option>
            <option value="image">Its own picture…</option>
          </select>
          <template v-if="kindOf(b[side]) === 'image'">
            <img :src="b[side]" alt="" class="thumb" />
            <button title="Pick a different picture" @click="pick(side)">Replace…</button>
          </template>
        </div>
      </div>
      <p v-if="err" class="err">{{ err }}</p>
      <p v-if="(b.left === 'icon' || b.right === 'icon') && !hasIcon" class="warn">Upload a launch icon under <b>Launch icon &amp; colors</b> to fill this spot.</p>

      <div class="row"><span class="l">Title</span><input :value="b.title ?? ''" :placeholder="store.project.meta.name || 'Plugin name'" spellcheck="true" @input="store.updateBanner({ title: ($event.target as HTMLInputElement).value || undefined })" /></div>
      <div class="row"><span class="l">Second line</span><input :value="b.subtitle ?? ''" placeholder="optional: agency, unit, motto" spellcheck="true" @input="store.updateBanner({ subtitle: ($event.target as HTMLInputElement).value || undefined })" /></div>
      <div class="row"><span class="l">Text</span>
        <span class="seg">
          <button :class="{ on: (b.align ?? 'left') === 'left' }" @click="store.updateBanner({ align: undefined })">Left</button>
          <button :class="{ on: b.align === 'center' }" @click="store.updateBanner({ align: 'center' })">Centered</button>
        </span>
      </div>
      <div class="row"><span class="l">Background</span>
        <span class="bg">
          <input type="color" :value="b.background ?? bgFallback" aria-label="Banner background" @input="store.updateBanner({ background: ($event.target as HTMLInputElement).value })" />
          <input class="hex" :class="{ unset: !b.background }" :value="bgDraft ?? b.background ?? 'title bar color'" spellcheck="false"
            @focus="bgDraft = b.background ?? ''" @input="bgDraft = ($event.target as HTMLInputElement).value" @change="commitBg(($event.target as HTMLInputElement).value)" @blur="bgDraft = null" />
          <button v-if="b.background" title="Match the title bar" @click="store.updateBanner({ background: undefined })">↺</button>
        </span>
      </div>
      <div class="row"><span class="l">Show on</span>
        <select :value="b.showOn ?? 'home'" @change="store.updateBanner({ showOn: ($event.target as HTMLSelectElement).value === 'all' ? 'all' : undefined })">
          <option value="home">Home screen only (opened by the launch button)</option>
          <option value="all">Every screen (not pop-up dialogs)</option>
        </select>
      </div>
      <p class="muted">Logos keep their shape: wide agency logos work as well as square icons. Text on the banner turns black or white to stay readable.</p>
    </template>
    <input ref="fileInput" type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" hidden @change="onFile(($event.target as HTMLInputElement).files?.[0]); ($event.target as HTMLInputElement).value = ''" />
  </div>
</template>

<style scoped>
h3 { margin: 16px 0 6px; font-size: 13px; }
.chk { display: flex; gap: 6px; align-items: center; font-size: 12px; margin: 4px 0 8px; }
.row { display: grid; grid-template-columns: 90px 1fr; gap: 6px; align-items: center; margin: 5px 0; }
.l { color: var(--muted); font-size: 12px; }
select, input:not([type='checkbox']):not([type='color']) { font: inherit; font-size: 12px; width: 100%; padding: 4px 6px; border: 1px solid var(--line); border-radius: 5px; background: var(--bg); color: var(--fg); box-sizing: border-box; min-width: 0; }
button { font: inherit; font-size: 12px; padding: 4px 8px; border: 1px solid var(--line); border-radius: 6px; background: var(--panel); color: var(--fg); cursor: pointer; white-space: nowrap; }
.layouts { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; margin-bottom: 8px; }
.lay { display: flex; flex-direction: column; align-items: stretch; gap: 4px; padding: 5px; font-size: 11px; }
.lay.on { border-color: var(--accent); box-shadow: inset 0 0 0 1px var(--accent); }
.mini { display: flex; align-items: center; gap: 4px; height: 22px; padding: 0 5px; background: #2e2e2e; border-radius: 3px; border-bottom: 2px solid var(--accent); }
.mini .lg { width: 14px; height: 14px; border-radius: 3px; background: #9aa4b2; flex-shrink: 0; }
.mini .ln { flex: 1; display: flex; flex-direction: column; gap: 2px; }
.mini.c .ln { align-items: center; }
.mini s { display: block; height: 4px; width: 70%; background: #e5e7eb; border-radius: 2px; text-decoration: none; }
.mini s.sm { width: 45%; background: #8b93a1; }
.logo { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; min-width: 0; }
.logo select { flex: 1 1 100%; }
.thumb { height: 26px; max-width: 60px; object-fit: contain; background: #1c1c1c; border-radius: 4px; padding: 2px; }
.seg { display: inline-flex; border: 1px solid var(--line); border-radius: 6px; overflow: hidden; justify-self: start; }
.seg button { border: 0; border-radius: 0; }
.seg button + button { border-left: 1px solid var(--line); }
.seg button.on { background: var(--accent); color: #fff; }
.bg { display: grid; grid-template-columns: 34px 1fr auto; gap: 6px; align-items: center; }
.bg input[type='color'] { width: 34px; height: 26px; padding: 0 2px; border: 1px solid var(--line); border-radius: 5px; background: var(--bg); cursor: pointer; }
.hex { font-family: ui-monospace, Consolas, monospace !important; }
.hex.unset { color: var(--muted); font-style: italic; }
.err, .warn { font-size: 11px; margin: 4px 0; } .err { color: var(--err); } .warn { color: var(--warn, #b26a00); }
.muted { color: var(--muted); font-size: 11px; margin: 6px 0; }
</style>
