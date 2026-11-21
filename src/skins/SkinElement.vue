<script setup lang="ts">
// Renders one element for any skin. Markup is shared; each platform's look comes from its
// theme file (skins/themes/*.css) over skins/base.css. Preview only: APPROXIMATE (PLAN.md §6),
// never a pixel spec for an emitter.
import { computed } from 'vue';
import type { ElementNode } from '../spec/types';
import { enumSample, optionsFor, resolveField, sampleValue, type PreviewCtx } from './preview';

const props = defineProps<{ node: ElementNode; ctx: PreviewCtx }>();

const p = computed(() => props.node.props);
const field = computed(() => resolveField(props.ctx, props.node.bind));
const value = computed(() => sampleValue(field.value, props.ctx.row));
const options = computed(() => optionsFor(props.node, props.ctx));
const badge = computed(() => (field.value?.type === 'enum' ? enumSample(field.value, props.ctx.row) : undefined));
const str = (k: string, fallback = '') => (typeof p.value[k] === 'string' ? (p.value[k] as string) : fallback);
const num = (k: string, fallback: number) => (typeof p.value[k] === 'number' ? (p.value[k] as number) : fallback);
const columns = computed(() => (Array.isArray(p.value.columns) ? (p.value.columns as string[]) : []));
const listField = computed(() => (field.value?.type === 'list' ? field.value : undefined));
const cellValue = (col: string, row: number) => {
  const f = listField.value?.itemFields?.find((x) => x.key === col);
  return f ? (f.type === 'enum' ? enumSample(f, row)?.label : sampleValue(f, row)) : '—';
};
const checked = computed(() => (field.value?.type === 'boolean' ? field.value.default === true : false));
</script>

<template>
  <h2 v-if="node.type === 'heading'" class="k-h" :class="'l' + str('level', '2')">{{ str('text') }}</h2>

  <p v-else-if="node.type === 'label'" class="k-text" :class="{ muted: p.muted }">{{ node.bind ? value : str('text') }}</p>

  <button v-else-if="node.type === 'button'" class="k-btn" :class="[str('style', 'primary'), { full: p.fullWidth }]">{{ str('text') }}</button>

  <button v-else-if="node.type === 'icon-button'" class="k-iconbtn" :title="str('tooltip')">◆<span class="hint">{{ str('icon') }}</span></button>

  <label v-else-if="['text-input', 'number-input', 'text-area', 'color-picker'].includes(node.type)" class="k-field">
    <span v-if="str('label')" class="k-lbl">{{ str('label') }}</span>
    <span class="k-edit" :class="{ area: node.type === 'text-area' }" :style="node.type === 'text-area' ? { minHeight: num('rows', 3) * 20 + 'px' } : {}">
      <template v-if="node.type === 'color-picker'"><i class="swatch" />#FF3B30</template>
      <template v-else-if="field && field.default !== undefined && field.default !== ''">{{ value }}</template>
      <span v-else class="ph">{{ str('placeholder') || (node.type === 'number-input' ? '0' : '') }}</span>
      <em v-if="str('unit')" class="unit">{{ str('unit') }}</em>
    </span>
  </label>

  <label v-else-if="node.type === 'dropdown'" class="k-field">
    <span v-if="str('label')" class="k-lbl">{{ str('label') }}</span>
    <span class="k-spinner">{{ (field?.type === 'enum' && badge?.label) || options[0]?.label }} <b>◢</b></span>
  </label>

  <label v-else-if="node.type === 'checkbox'" class="k-check"><i class="box" :class="{ on: checked }" />{{ str('label') }}</label>

  <label v-else-if="node.type === 'toggle'" class="k-check toggle"><span>{{ str('label') }}</span><i class="sw" :class="{ on: checked }" /></label>

  <fieldset v-else-if="node.type === 'radio-group'" class="k-radio" :class="{ h: p.horizontal }">
    <legend v-if="str('label')" class="k-lbl">{{ str('label') }}</legend>
    <label v-for="(o, i) in options" :key="o.value"><i class="dot" :class="{ on: badge ? o.value === badge.value : i === 0 }" />{{ o.label }}</label>
  </fieldset>

  <label v-else-if="node.type === 'slider'" class="k-field">
    <span v-if="str('label')" class="k-lbl">{{ str('label') }} <em>{{ field ? value : num('min', 0) }}</em></span>
    <span class="k-slider"><i /></span>
  </label>

  <label v-else-if="node.type === 'datetime'" class="k-field">
    <span v-if="str('label')" class="k-lbl">{{ str('label') }}</span>
    <span class="k-edit">{{ str('mode', 'datetime') === 'date' ? '2026-11-14' : str('mode') === 'time' ? '14:32' : '2026-11-14 14:32' }} 🗓</span>
  </label>

  <div v-else-if="node.type === 'image'" class="k-img" :style="{ height: num('height', 96) + 'px' }">🖼 {{ str('hint') || str('alt') }}</div>

  <hr v-else-if="node.type === 'divider'" class="k-hr" />

  <label v-else-if="node.type === 'progress'" class="k-field">
    <span v-if="str('label')" class="k-lbl">{{ str('label') }}</span>
    <span class="k-progress"><i :style="{ width: field ? Math.min(100, (Number(value) / num('max', 100)) * 100) + '%' : '35%' }" /></span>
  </label>

  <span v-else-if="node.type === 'status-badge'" class="k-badge" :class="str('size', 'small')" :style="{ background: badge?.color ?? '#555' }">{{ badge?.label ?? 'Status' }}</span>

  <div v-else-if="node.type === 'empty-state'" class="k-empty">{{ str('text') }}</div>

  <table v-else-if="node.type === 'table'" class="k-table">
    <thead><tr><th v-for="c in columns" :key="c">{{ c }}</th><th v-if="!columns.length">(pick columns)</th></tr></thead>
    <tbody><tr v-for="r in [0, 1, 2]" :key="r"><td v-for="c in columns" :key="c">{{ cellValue(c, r) }}</td></tr></tbody>
  </table>

  <label v-else-if="node.type === 'map-point-picker'" class="k-field">
    <span class="k-lbl">{{ str('label', 'Location') }}</span>
    <span class="k-row"><span class="k-edit grow">{{ field ? value : 'Not set' }}</span><button class="k-btn">⌖ {{ str('buttonText', 'Pick on map') }}</button></span>
  </label>

  <label v-else-if="node.type === 'coordinate-field'" class="k-field">
    <span class="k-lbl">{{ str('label', 'Coordinates') }} <em>{{ str('format', 'mgrs').toUpperCase() }}</em></span>
    <span class="k-edit mono">{{ str('format', 'mgrs') === 'mgrs' ? value || '16S EJ 12345 67890' : '39.1727, -86.5226' }}</span>
  </label>

  <label v-else-if="node.type === 'contact-picker'" class="k-field">
    <span class="k-lbl">{{ str('label', 'Send to') }}</span>
    <span class="k-spinner">👤 {{ field ? value : 'Choose contact…' }} <b>◢</b></span>
  </label>

  <span v-else-if="node.type === 'callsign'" class="k-callsign"><i v-if="p.showTeamColor !== false" class="team" />{{ node.bind ? value : 'MY-CALLSIGN' }}</span>

  <button v-else-if="node.type === 'map-item-ref'" class="k-mapitem">📍 {{ str('label') || 'Map item' }}<em>{{ field ? value : 'uid…' }}</em></button>

  <button v-else-if="node.type === 'open-on-map'" class="k-btn secondary">🗺 {{ str('text', 'Show on map') }}</button>

  <label v-else-if="node.type === 'cot-type-picker'" class="k-field">
    <span class="k-lbl">{{ str('label', 'Type') }}</span>
    <span class="k-spinner">▣ a-f-G-U-C <b>◢</b></span>
  </label>

  <label v-else-if="node.type === 'data-package-attach'" class="k-field">
    <span class="k-lbl">{{ str('label', 'Attachment') }}</span>
    <span class="k-row"><span class="k-edit grow ph">No file</span><button class="k-btn secondary">📎 Attach</button></span>
  </label>

  <span v-else-if="node.type === 'chat-send'" class="k-row"><span class="k-edit grow ph">{{ str('placeholder', 'Message') }}</span><button class="k-btn">Send</button></span>

  <div v-else class="k-unknown">Unknown component “{{ node.type }}”</div>
</template>
