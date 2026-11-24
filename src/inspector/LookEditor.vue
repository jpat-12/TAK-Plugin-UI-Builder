<script setup lang="ts">
// "Launch icon & colors": the plugin's own look. Upload a launch icon (resized to a square PNG
// in the spec) and pick custom colors that every screen, preview and mockup uses.
import { computed, ref, watch } from 'vue';
import { contrast, dominantColors, isHex, PLATFORM_BG, UI_CONTRAST } from '../spec/color';
import type { Theme } from '../spec/types';
import { TARGET_NAMES } from '../spec/validate';
import { useProject } from '../store/project';
import { iconFromFile, iconPixels } from './icon';
import { PRESETS, themeFrom, type ColorPreset } from './presets';

const store = useProject();
const entry = computed(() => store.project.entry);
const theme = computed<Theme>(() => store.project.theme ?? {});
const targets = computed(() => store.project.meta.targets);

// ---- icon ----
const fileInput = ref<HTMLInputElement | null>(null);
const iconError = ref('');
const dragging = ref(false);
async function useFile(f: File | undefined) {
  iconError.value = '';
  if (!f) return;
  try {
    store.updateEntry({ iconImage: await iconFromFile(f) });
  } catch (e) {
    iconError.value = (e as Error).message;
  }
}
function onDrop(e: DragEvent) {
  dragging.value = false;
  useFile(e.dataTransfer?.files[0]);
}

/** "From my icon": a full color set per main color of the uploaded icon */
const fromIcon = ref<ColorPreset[]>([]);
watch(() => entry.value.iconImage, async (src) => {
  fromIcon.value = [];
  if (!src) return;
  try {
    const colors = dominantColors(await iconPixels(src), 3);
    fromIcon.value = colors.map((c, i) => ({ name: colors.length > 1 ? `From icon ${i + 1}` : 'From icon', theme: themeFrom(c, targets.value) }));
  } catch { /* unreadable image: no suggestions */ }
}, { immediate: true });

// ---- colors ----
const ROLES: { key: keyof Theme; label: string; hint: string; fallback: string }[] = [
  { key: 'accent', label: 'Highlight', hint: 'Headings, the active tab, input underlines, toggles and sliders', fallback: '#33b5e5' },
  { key: 'primary', label: 'Main buttons', hint: 'Buttons set to the "primary" style. Their text turns black or white to stay readable.', fallback: '#2c5f73' },
  { key: 'header', label: 'Title bar', hint: 'The bar across the top of each screen', fallback: '#111111' },
];
const draft = ref<Record<string, string>>({});
function commitHex(key: keyof Theme, v: string) {
  const hex = v.trim().startsWith('#') ? v.trim() : '#' + v.trim();
  if (isHex(hex)) store.updateTheme({ [key]: hex.toLowerCase() });
  delete draft.value[key];
}
const applyPreset = (t: Theme) => store.updateTheme({ ...t });
const clearColors = () => store.updateTheme({ accent: undefined, primary: undefined, header: undefined });
const isActive = (t: Theme) => t.accent === theme.value.accent && t.primary === theme.value.primary && t.header === theme.value.header;

/** Accent readability per selected platform, worst first */
const accentCheck = computed(() => {
  const a = theme.value.accent;
  if (!a) return null;
  const rows = targets.value.map((t) => ({ t, r: contrast(a, PLATFORM_BG[t]) })).sort((x, y) => x.r - y.r);
  return { worst: rows[0]!, ok: rows.every((x) => x.r >= UI_CONTRAST) };
});
</script>

<template>
  <div class="look" data-tour="look">
    <h3>Launch icon &amp; colors</h3>
    <div class="row"><span class="l">Button label</span><input :value="entry.label" @input="store.updateEntry({ label: ($event.target as HTMLInputElement).value })" /></div>

    <div class="iconrow">
      <button class="tile" :class="{ drag: dragging }" title="Upload a picture (or drop one here)"
        @click="fileInput?.click()" @dragover.prevent="dragging = true" @dragleave="dragging = false" @drop.prevent="onDrop">
        <img v-if="entry.iconImage" :src="entry.iconImage" alt="Launch icon" />
        <span v-else>＋<small>Icon</small></span>
      </button>
      <div class="iconside">
        <div class="sizes" v-if="entry.iconImage">
          <img :src="entry.iconImage" width="32" height="32" alt="" /><img :src="entry.iconImage" width="20" height="20" alt="" />
          <span class="muted">toolbar sizes</span>
        </div>
        <div class="buttons">
          <button @click="fileInput?.click()">{{ entry.iconImage ? 'Replace…' : 'Upload picture…' }}</button>
          <button v-if="entry.iconImage" class="danger" @click="store.updateEntry({ iconImage: undefined })">Remove</button>
        </div>
        <p class="muted">PNG, JPG or SVG. A simple shape on a transparent background works best; it's shrunk to a square.</p>
      </div>
      <input ref="fileInput" type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" hidden @change="useFile(($event.target as HTMLInputElement).files?.[0]); ($event.target as HTMLInputElement).value = ''" />
    </div>
    <p v-if="iconError" class="err">{{ iconError }}</p>
    <div class="row"><span class="l">Icon idea</span><input :value="entry.icon ?? ''" :placeholder="entry.iconImage ? 'optional, e.g. ambulance' : 'or describe one: ambulance'" @input="store.updateEntry({ icon: ($event.target as HTMLInputElement).value || undefined })" /></div>

    <h4>Colors</h4>
    <div class="presets">
      <button v-for="pr in [...fromIcon, ...PRESETS]" :key="pr.name" class="preset" :class="{ on: isActive(pr.theme) }" :title="pr.name" @click="applyPreset(pr.theme)">
        <i :style="{ background: pr.theme.header }" /><i :style="{ background: pr.theme.primary }" /><i :style="{ background: pr.theme.accent }" />
        <span>{{ pr.name }}</span>
      </button>
    </div>
    <div v-for="r in ROLES" :key="r.key" class="crow" :title="r.hint">
      <span class="l">{{ r.label }}</span>
      <input type="color" :value="theme[r.key] ?? r.fallback" :aria-label="r.label + ' color'" @input="store.updateTheme({ [r.key]: ($event.target as HTMLInputElement).value })" />
      <input class="hex" :class="{ unset: !theme[r.key] }" :value="draft[r.key] ?? theme[r.key] ?? 'default'" spellcheck="false"
        @focus="draft[r.key] = theme[r.key] ?? ''" @input="draft[r.key] = ($event.target as HTMLInputElement).value"
        @change="commitHex(r.key, ($event.target as HTMLInputElement).value)" @blur="delete draft[r.key]" />
      <button v-if="theme[r.key]" class="reset" title="Use the platform's own color" @click="store.updateTheme({ [r.key]: undefined })">↺</button>
    </div>
    <p v-if="accentCheck" :class="accentCheck.ok ? 'ok' : 'err'">
      {{ accentCheck.ok ? '✓ Highlight is easy to see' : '⚠ Highlight is hard to see' }} on
      {{ TARGET_NAMES[accentCheck.worst.t] }}'s dark panel ({{ accentCheck.worst.r.toFixed(1) }}:1, aim for {{ UI_CONTRAST }}:1 or more).
    </p>
    <div class="buttons">
      <button v-if="store.project.theme" @click="clearColors">Use platform colors</button>
    </div>
    <p class="muted">The launch button is the ATAK toolbar tool, CloudTAK's home-menu icon, WinTAK's ribbon button and TAKX's toolbar button. Colors apply to every screen.</p>
  </div>
</template>

<style scoped>
h3 { margin: 16px 0 6px; font-size: 13px; }
h4 { margin: 12px 0 6px; font-size: 12px; color: var(--muted); font-weight: 600; }
.row { display: grid; grid-template-columns: 90px 1fr; gap: 6px; align-items: center; margin: 5px 0; }
.l { color: var(--muted); font-size: 12px; }
input:not([type='color']) { font: inherit; font-size: 12px; width: 100%; padding: 4px 6px; border: 1px solid var(--line); border-radius: 5px; background: var(--bg); color: var(--fg); box-sizing: border-box; }
button { font: inherit; font-size: 12px; padding: 5px 10px; border: 1px solid var(--line); border-radius: 6px; background: var(--panel); color: var(--fg); cursor: pointer; }
.buttons { display: flex; gap: 6px; flex-wrap: wrap; margin: 6px 0; }
.danger, .err { color: var(--err); } .ok { color: var(--ok); }
.err, .ok { font-size: 11px; margin: 4px 0; }
.muted { color: var(--muted); font-size: 11px; margin: 4px 0; }
.iconrow { display: grid; grid-template-columns: 72px 1fr; gap: 10px; align-items: start; margin: 8px 0; }
/* dark checkerboard: TAK toolbars are dark, and transparency should be visible */
.tile { width: 72px; height: 72px; padding: 6px; border: 1px dashed var(--line); border-radius: 10px;
  background: #1c1c1c repeating-conic-gradient(#262626 0 25%, #1c1c1c 0 50%) 0 0 / 12px 12px; display: flex; align-items: center; justify-content: center; color: #bbb; }
.tile.drag { border-color: var(--accent); border-style: solid; }
.tile img { width: 100%; height: 100%; object-fit: contain; }
.tile span { display: flex; flex-direction: column; font-size: 20px; line-height: 1; } .tile small { font-size: 10px; margin-top: 3px; }
.sizes { display: flex; gap: 8px; align-items: center; }
.sizes img { background: #1c1c1c; border-radius: 4px; padding: 3px; }
.presets { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 8px; }
.preset { display: flex; align-items: center; gap: 0; padding: 3px 7px 3px 3px; font-size: 11px; }
.preset.on { border-color: var(--accent); box-shadow: inset 0 0 0 1px var(--accent); }
.preset i { width: 10px; height: 18px; display: inline-block; }
.preset i:first-child { border-radius: 3px 0 0 3px; } .preset i:nth-child(3) { border-radius: 0 3px 3px 0; }
.preset span { margin-left: 6px; }
.crow { display: grid; grid-template-columns: 90px 34px 1fr 26px; gap: 6px; align-items: center; margin: 5px 0; }
.crow input[type='color'] { width: 34px; height: 26px; padding: 0 2px; border: 1px solid var(--line); border-radius: 5px; background: var(--bg); cursor: pointer; }
.hex { font-family: ui-monospace, Consolas, monospace !important; }
.hex.unset { color: var(--muted); font-style: italic; }
.reset { padding: 3px 0; }
</style>
