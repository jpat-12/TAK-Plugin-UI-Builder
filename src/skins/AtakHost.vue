<script setup lang="ts">
// ATAK's host screen around a plugin pane: Android status bar, camera cutout and gesture strip,
// the map's own widgets, the toolbar row (where the plugin's launch button lives) and the self
// info box. Layout measured from ATAK 5.6 on a Pixel 7a (see FRAMES in frames.ts); drawn with
// generic shapes, not ATAK's artwork. Purely decorative: it never holds design state.
import { computed } from 'vue';
import type { SizedFrame } from './frames';

const props = defineProps<{
  frame: SizedFrame;
  /** width the open pane covers on the right (0 when a dialog is shown instead) */
  pane: number;
  launchLabel: string;
  launchIcon?: string;
}>();

const ins = computed(() => props.frame.inset ?? { top: 0, left: 0, bottom: 0 });
const bar = computed(() => props.frame.toolbar ?? 48);
const landscape = computed(() => props.frame.w > props.frame.h);
/** map the user can still see beside the pane */
const mapW = computed(() => props.frame.w - ins.value.left - props.pane);
const px = (n: number) => `${n}px`;
</script>

<template>
  <div class="atak-host" aria-hidden="true">
    <!-- Android status bar -->
    <div class="status" :style="{ height: px(ins.top), paddingLeft: px(ins.left + 14) }">
      <span class="clock">12:00</span>
      <span class="sys">
        <svg viewBox="0 0 20 14" width="17"><path d="M10 13 1 4a13 13 0 0 1 18 0z" fill="currentColor" /></svg>
        <i class="batt"><i /></i>
      </span>
    </div>
    <!-- camera punch-hole: in the cutout band in landscape, mid status bar in portrait -->
    <i v-if="ins.top" class="cam" :style="landscape && ins.left
      ? { left: px(ins.left / 2 - 5), top: px(frame.h / 2 - 5) }
      : { left: px(frame.w / 2 - 5), top: px(ins.top / 2 - 5) }" />

    <!-- map widgets, top-left of the map -->
    <div class="widgets" :style="{ left: px(ins.left + 10), top: px(ins.top + 10) }">
      <div class="compass"><i /></div>
      <small>GPS</small>
      <svg class="locate" viewBox="0 0 32 32" width="30"><circle cx="16" cy="16" r="10" /><path d="M16 1v8M16 23v8M1 16h8M23 16h8" /></svg>
      <div class="zoom"><b>+</b><b>−</b></div>
    </div>

    <!-- record button + scale bar, bottom-left -->
    <div class="rec" :style="{ left: px(ins.left + 10), bottom: px(ins.bottom + 8) }"><i /></div>
    <div class="scale" :style="{ left: px(ins.left + 58), bottom: px(ins.bottom + 10) }"><span>500 m</span></div>

    <!-- toolbar row: generic tools, the plugin's launch button, then the menu -->
    <div v-if="pane" class="band" :style="{ top: px(ins.top), height: px(bar), width: px(pane) }" />
    <div class="toolbar" :style="{ top: px(ins.top), height: px(bar), '--s': px(Math.round(bar * 0.62)) }">
      <svg viewBox="0 0 24 24"><path d="M4 9h16M4 15h16M9 4v16" /><rect x="4" y="4" width="16" height="16" rx="2" /></svg>
      <svg viewBox="0 0 24 24"><circle cx="7" cy="8" r="3" /><circle cx="17" cy="8" r="3" /><path d="M2 20c0-4 2-6 5-6s5 2 5 6M12 20c0-4 2-6 5-6s5 2 5 6" /></svg>
      <svg viewBox="0 0 24 24"><path d="m12 3 9 5-9 5-9-5z" /><path d="m3 12 9 5 9-5M3 16l9 5 9-5" /></svg>
      <svg viewBox="0 0 24 24"><path d="M12 21s-7-7-7-12a7 7 0 0 1 14 0c0 5-7 12-7 12z" /><circle cx="12" cy="9" r="2.5" /></svg>
      <span class="launch" :title="`${launchLabel} (your plugin's launch button)`">
        <img v-if="launchIcon" :src="launchIcon" alt="" /><b v-else>{{ (launchLabel || '?').slice(0, 1) }}</b>
      </span>
      <span class="menu"><svg viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h16" /></svg></span>
    </div>

    <!-- self info box: moves left of an open pane, hidden when there's no room -->
    <div v-if="mapW >= 300" class="self" :style="{ right: px(pane + 6), bottom: px(ins.bottom + 6) }">
      <div>Callsign: ALPHA-1</div>
      <div>16T DL 26040 98481</div>
      <div class="two"><span>703 ft MSL</span><span>227°M</span></div>
      <div class="two"><span>0 MPH</span><span>+/- 7m</span></div>
    </div>

    <!-- the pane's drag grip sits on its left edge -->
    <div v-if="pane && pane < frame.w - ins.left" class="grip"
      :style="{ right: px(pane), top: px(ins.top + bar + (frame.h - ins.top - bar - ins.bottom) / 2 - 36) }"><i /><i /></div>

    <i v-if="ins.bottom" class="pill" :style="{ bottom: px(ins.bottom / 2 - 2), width: px(landscape ? 110 : 120) }" />
  </div>
</template>

<style scoped>
.atak-host { position: absolute; inset: 0; pointer-events: none; color: #fff; font: 12px Roboto, system-ui, sans-serif; }
.status { position: absolute; top: 0; left: 0; right: 0; background: #000; display: flex; align-items: center; justify-content: space-between; padding-right: 18px; }
.clock { font-weight: 600; font-size: 13px; }
.sys { display: flex; align-items: center; gap: 7px; }
.batt { display: inline-block; width: 20px; height: 10px; border-radius: 3px; background: #777; position: relative; }
.batt i { position: absolute; inset: 0 30% 0 0; border-radius: 3px; background: #fff; }
.cam { position: absolute; width: 10px; height: 10px; border-radius: 50%; background: #1b1b1b; box-shadow: inset 0 0 0 2px #2a2a2a; }
.widgets { position: absolute; display: flex; flex-direction: column; align-items: center; width: 36px; }
.compass { width: 32px; height: 32px; border-radius: 50%; border: 2.5px solid #fff; background: rgba(0,0,0,.35); position: relative; }
.compass i { position: absolute; left: 50%; top: 4px; margin-left: -6px; border: 6px solid transparent; border-bottom: 17px solid #e53935; border-top: 0; }
.widgets small { font-size: 10px; margin: 1px 0 12px; text-shadow: 0 0 3px #000; }
.locate { fill: none; stroke: #fff; stroke-width: 2.4; margin-bottom: 14px; filter: drop-shadow(0 0 2px #000); }
.zoom { width: 28px; height: 70px; border: 2.5px solid #fff; border-radius: 14px; background: rgba(0,0,0,.25); display: flex; flex-direction: column; justify-content: space-around; align-items: center; }
.zoom b { font: 700 20px system-ui; line-height: 1; }
.rec { position: absolute; width: 38px; height: 46px; border-radius: 8px; background: #111; border: 2px solid #555; display: flex; align-items: center; justify-content: center; }
.rec i { width: 20px; height: 20px; border-radius: 50%; background: #fff; box-shadow: inset 0 0 0 5px #fff, inset 0 0 0 10px #e53935; }
.scale { position: absolute; width: 90px; height: 8px; border: 1.5px solid #fff; border-top: 0; }
.scale span { position: absolute; left: 0; top: -13px; font-size: 10px; background: rgba(0,0,0,.55); border-radius: 8px; padding: 0 5px; }
.band { position: absolute; right: 0; background: #262626; border-bottom: 1px solid #3a3a3a; }
.toolbar { position: absolute; right: 0; display: flex; align-items: center; gap: calc(var(--s) * .45); padding-left: 10px; }
.toolbar svg, .toolbar .launch { width: var(--s); height: var(--s); }
.toolbar svg { fill: none; stroke: #fff; stroke-width: 1.8; stroke-linejoin: round; stroke-linecap: round; filter: drop-shadow(0 0 2px rgba(0,0,0,.8)); }
.launch { display: flex; align-items: center; justify-content: center; border-radius: 6px; background: rgba(255,255,255,.16); box-shadow: inset 0 0 0 1.5px rgba(255,255,255,.7); pointer-events: auto; }
.launch img { max-width: 80%; max-height: 80%; }
.launch b { font: 600 15px system-ui; }
.menu { height: 100%; display: flex; align-items: center; padding: 0 12px; background: #262626; border-bottom-left-radius: 10px; }
.self { position: absolute; padding: 4px 8px; border-radius: 6px; background: rgba(0,0,0,.5); color: #4dd9e8; font-size: 12px; line-height: 1.35; min-width: 190px; }
.self .two { display: flex; justify-content: space-between; gap: 16px; }
.grip { position: absolute; width: 12px; height: 72px; background: rgba(38,38,38,.92); border-radius: 6px 0 0 6px; display: flex; justify-content: center; align-items: center; gap: 2px; }
.grip i { width: 2px; height: 18px; background: #888; }
.pill { position: absolute; left: 50%; height: 4px; border-radius: 2px; background: #ddd; transform: translateX(-50%); }
</style>
