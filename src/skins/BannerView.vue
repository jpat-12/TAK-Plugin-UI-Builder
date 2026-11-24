<script setup lang="ts">
// The plugin's home banner inside a preview pane or mockup. Pure view of bannerFor().
import type { BannerLook } from './banner';
defineProps<{ look: BannerLook }>();
</script>

<template>
  <div class="k-banner" :class="'al-' + look.align" :style="look.bg ? { background: look.bg, color: look.fg } : {}">
    <span v-if="look.left !== undefined" class="logo">
      <img v-if="look.left" :src="look.left" alt="" /><b v-else>{{ look.initial }}</b>
    </span>
    <div class="txt">
      <div class="t">{{ look.title }}</div>
      <div v-if="look.subtitle" class="s">{{ look.subtitle }}</div>
    </div>
    <span v-if="look.right !== undefined" class="logo">
      <img v-if="look.right" :src="look.right" alt="" /><b v-else>{{ look.initial }}</b>
    </span>
  </div>
</template>

<style scoped>
.k-banner { display: flex; align-items: center; gap: 12px; padding: 10px 14px; background: var(--k-head); border-bottom: 2px solid var(--k-accent); flex-shrink: 0; }
.txt { flex: 1; min-width: 0; }
.al-center .txt { text-align: center; }
.t { font-size: 1.3em; font-weight: 700; line-height: 1.2; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.s { font-size: .86em; opacity: .78; margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.logo { height: 44px; max-width: 132px; display: flex; align-items: center; flex-shrink: 0; }
.logo img { max-height: 44px; max-width: 132px; object-fit: contain; }
.logo b { width: 44px; height: 44px; border-radius: 8px; border: 1px dashed currentColor; opacity: .6; display: flex; align-items: center; justify-content: center; font-size: 18px; }
</style>
