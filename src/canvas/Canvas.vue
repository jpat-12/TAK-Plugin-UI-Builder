<script setup lang="ts">
// Center column: screen tabs + the selected screen inside the previewed platform's frame.
import { computed, onBeforeUnmount, onMounted, ref, watchEffect } from 'vue';
import { useProject } from '../store/project';
import { CUSTOM, FRAMES, SIZES, SIZE_MAX, SIZE_MIN, SKINNED, clampSize } from '../skins/frames';
import { themeVars } from '../skins/theme';
import { bannerFor } from '../skins/banner';
import BannerView from '../skins/BannerView.vue';
import AtakHost from '../skins/AtakHost.vue';
import { TARGET_NAMES } from '../spec/validate';
import type { Target } from '../spec/types';
import { customSize, frameChoice, frameFor, frameKeyFor, previewTarget, sizeChoice, sizeKeyFor } from './view';
import CanvasNode from './CanvasNode.vue';
import '../skins/base.css';
import '../skins/themes/atak.css';
import '../skins/themes/cloudtak.css';
import '../skins/themes/wintak.css';
import '../skins/themes/webtak.css';
import '../skins/themes/takx.css';

const store = useProject();

/** Preview only platforms the project targets (and that have a skin) */
const previewable = computed(() => store.project.meta.targets.filter((t) => SKINNED.includes(t)));
watchEffect(() => {
  if (previewable.value.length && !previewable.value.includes(previewTarget.value)) previewTarget.value = previewable.value[0]!;
});
const target = computed<Target>(() => previewTarget.value);
const frames = computed(() => FRAMES[target.value] ?? {});
const frameKey = computed(() => frameKeyFor(target.value));
const frame = computed(() => frameFor(target.value));
const setFrame = (k: string) => { frameChoice.value = { ...frameChoice.value, [target.value]: k }; };

// screen size: a preset for this kind of device, or a typed-in width × height
const sizes = computed(() => SIZES[frame.value.chrome]);
const sizeKey = computed(() => sizeKeyFor(frame.value.chrome, FRAMES[target.value]![frameKey.value]!.size));
const setSize = (k: string) => {
  const c = frame.value.chrome;
  // starting a custom size from the one on screen is less surprising than a jump
  if (k === CUSTOM && !customSize.value[c]) customSize.value = { ...customSize.value, [c]: { w: frame.value.w, h: frame.value.h } };
  sizeChoice.value = { ...sizeChoice.value, [c]: k };
};
const setCustom = (dim: 'w' | 'h', v: string) => {
  const c = frame.value.chrome;
  const n = Number(v);
  if (!v || !Number.isFinite(n)) return;
  customSize.value = { ...customSize.value, [c]: { w: frame.value.w, h: frame.value.h, [dim]: clampSize(n) } };
};

// scale the device to fit the column (transform, not CSS zoom: zoom breaks hit-testing in some browsers)
const stage = ref<HTMLElement | null>(null);
const stageWidth = ref(1200);
let ro: ResizeObserver | undefined;
onMounted(() => {
  ro = new ResizeObserver(([e]) => { if (e) stageWidth.value = e.contentRect.width; });
  if (stage.value) ro.observe(stage.value);
});
onBeforeUnmount(() => ro?.disconnect());
// Rugged hardware drawn around the screen: a cased phone/tablet (bezel thicker on the short ends) or,
// for desktop clients, a rugged laptop (lid bezel + a base that overhangs the lid by LAPTOP.overhang).
const LAPTOP = { bezel: 28, chin: 34, overhang: 24, base: 64 };
const shell = computed(() => {
  const { chrome: c, w, h } = frame.value;
  if (c === 'window') {
    const left = LAPTOP.overhang + LAPTOP.bezel;
    return { left, top: LAPTOP.bezel, w: w + 2 * left, h: h + LAPTOP.bezel + LAPTOP.chin + LAPTOP.base };
  }
  const [long, short] = c === 'phone' ? [36, 22] : [40, 30];
  const [x, y] = w > h ? [long, short] : [short, long];
  return { left: x, top: y, w: w + 2 * x, h: h + 2 * y };
});
const caseW = computed(() => shell.value.w);
const caseH = computed(() => shell.value.h);
const scale = computed(() => Math.min(1, (stageWidth.value - 24) / caseW.value));

const ctx = computed(() => ({ project: store.project }));
const s = computed(() => store.screen);
const colors = computed(() => themeVars(store.project.theme));
const entry = computed(() => store.project.entry);
const banner = computed(() => bannerFor(store.project, s.value));
const ins = computed(() => frame.value.inset ?? { top: 0, left: 0, bottom: 0 });
/** where the map starts: below a window title bar, a host ribbon or the phone's status bar */
const top = computed(() => (frame.value.chrome === 'window' ? 30 : 0) + (frame.value.topbar ?? 0) + ins.value.top);
/** ATAK panes open below its toolbar row */
const paneTop = computed(() => top.value + (frame.value.toolbar ?? 0));
</script>

<template>
  <div class="canvas-col">
    <div class="screens">
      <button v-for="sc in store.project.screens" :key="sc.id" class="stab" :class="{ on: sc.id === s.id }" @click="store.selectScreen(sc.id)">
        <span class="surf">{{ sc.surface === 'dialog' ? '◱' : sc.surface === 'settings' ? '⚙' : '▤' }}</span>{{ sc.title || sc.id }}
        <span v-if="store.project.entry.openScreen === sc.id" class="entry" title="Opened by the plugin's launch button">▶</span>
      </button>
      <span class="add">
        + <button @click="store.addScreen('pane')">Screen</button><button @click="store.addScreen('dialog')">Dialog</button><button @click="store.addScreen('settings')">Settings</button>
      </span>
      <span class="view">
        <span class="seg" role="group" aria-label="Preview platform" data-tour="preview">
          <button v-for="t in previewable" :key="t" :class="{ on: t === target }" @click="previewTarget = t">{{ TARGET_NAMES[t] }}</button>
        </span>
        <select v-if="Object.keys(frames).length > 1" class="frame" :value="frameKey" aria-label="Device frame" @change="setFrame(($event.target as HTMLSelectElement).value)">
          <option v-for="(f, k) in frames" :key="k" :value="k">{{ f.label }}</option>
        </select>
        <select class="frame" :value="sizeKey" aria-label="Screen size" @change="setSize(($event.target as HTMLSelectElement).value)">
          <option v-for="(z, k) in sizes" :key="k" :value="k">{{ z.label }} · {{ z.w }}×{{ z.h }}</option>
          <option :value="CUSTOM">Custom size…</option>
        </select>
        <span v-if="sizeKey === CUSTOM" class="custom">
          <input type="number" :min="SIZE_MIN" :max="SIZE_MAX" step="10" :value="frame.w" aria-label="Screen width in pixels" @change="setCustom('w', ($event.target as HTMLInputElement).value)" />
          ×
          <input type="number" :min="SIZE_MIN" :max="SIZE_MAX" step="10" :value="frame.h" aria-label="Screen height in pixels" @change="setCustom('h', ($event.target as HTMLInputElement).value)" />
          px
        </span>
      </span>
    </div>

    <div v-if="!previewable.length" class="noskin">
      There's no preview for {{ store.project.meta.targets.map((t) => TARGET_NAMES[t]).join(', ') }} yet. Its UI toolkit hasn't been verified.
      Add another platform under Plugin → Platforms to see a preview. You can still design and validate.
    </div>

    <div v-else ref="stage" class="stage" @click="store.select(null)">
      <div class="fit" :style="{ width: caseW * scale + 'px', height: caseH * scale + 'px' }">
        <div class="case" :class="[frame.chrome, frame.w > frame.h ? 'land' : 'port']"
          :style="{ width: caseW + 'px', height: caseH + 'px', transform: `scale(${scale})` }">
        <template v-if="frame.chrome !== 'window'">
          <!-- generic rugged case: grip panel on one end, hardware buttons on the long edge -->
          <i class="grip-end" aria-hidden="true" />
          <i class="hw b1" aria-hidden="true" /><i class="hw b2" aria-hidden="true" /><i class="hw b3" aria-hidden="true" />
        </template>
        <template v-else>
          <!-- generic rugged laptop: bumpered lid, webcam, and the base with keyboard and carry handle -->
          <div class="lid" aria-hidden="true" :style="{ left: LAPTOP.overhang + 'px', right: LAPTOP.overhang + 'px', height: frame.h + LAPTOP.bezel + LAPTOP.chin + 'px' }">
            <i class="bump tl" /><i class="bump tr" /><i class="bump bl" /><i class="bump br" /><i class="webcam" />
          </div>
          <div class="deck" aria-hidden="true" :style="{ height: LAPTOP.base + 'px' }"><i class="keys" /><i class="handle" /></div>
        </template>
        <div class="device" :class="frame.chrome" :style="{ width: frame.w + 'px', height: frame.h + 'px', left: shell.left + 'px', top: shell.top + 'px' }">
          <div v-if="frame.chrome === 'window'" class="winbar"><i /><i /><i /><span>{{ frame.host }}</span></div>
          <div v-if="frame.topbar" class="hostbar" :class="target" :style="{ top: (frame.chrome === 'window' ? 30 : 0) + 'px', height: frame.topbar + 'px' }">
            <span class="launch" :title="`${entry.label} (your plugin's launch button)`">
              <img v-if="entry.iconImage" :src="entry.iconImage" alt="" /><b v-else>{{ (entry.label || '?').slice(0, 1) }}</b>
            </span>
            <span v-for="n in 5" :key="n" />
          </div>
          <div class="map" :class="target" :style="{ top: top + 'px', left: ins.left + 'px', bottom: ins.bottom + 'px' }">
            <span v-if="!frame.toolbar">{{ target === 'takx' ? 'globe' : 'map' }}</span>
            <div v-if="!frame.topbar && !frame.toolbar" class="maptools" :title="`${entry.label} (your plugin's launch button)`">
              <div class="launch"><img v-if="entry.iconImage" :src="entry.iconImage" alt="" /><b v-else>{{ (entry.label || '?').slice(0, 1) }}</b></div>
            </div>
          </div>

          <AtakHost v-if="frame.toolbar" :frame="frame" :pane="s.surface === 'dialog' ? 0 : frame.pane"
            :launch-label="entry.label" :launch-icon="entry.iconImage" />

          <div v-if="s.surface === 'dialog'" class="dialog-wrap" :style="{ top: top + 'px', bottom: ins.bottom + 'px' }">
            <div class="dialog skin" :class="'skin-' + target" :style="{ width: Math.min(frame.pane, 460) + 'px', ...colors }">
              <div class="d-title">{{ s.title }}</div>
              <div class="scroll"><CanvasNode :node="s.root" :ctx="ctx" is-root /></div>
              <div class="d-buttons">
                <template v-if="target === 'atak'"><span>CANCEL</span><span>OK</span></template>
                <template v-else><button class="k-btn">Cancel</button><button class="k-btn primary">OK</button></template>
              </div>
            </div>
          </div>

          <div v-else class="pane skin" data-tour="pane" :class="['skin-' + target, frame.dock]"
            :style="{ width: frame.pane + 'px', top: frame.dock === 'float' ? top + 24 + 'px' : paneTop + 'px', bottom: frame.dock === 'float' ? undefined : ins.bottom + 'px', ...colors }">
            <div class="p-title">
              <span>{{ s.surface === 'settings' ? (target === 'atak' ? `Settings › ${s.title}` : `${s.title} (settings)`) : s.title }}</span>
              <span class="x">✕</span>
            </div>
            <BannerView v-if="banner" :look="banner" />
            <div class="scroll"><CanvasNode :node="s.root" :ctx="ctx" is-root /></div>
          </div>
        </div>
        </div>
      </div>
      <p class="note">{{ frame.w }}×{{ frame.h }} px screen, {{ frame.pane }} px panel<template v-if="scale < 1"> (shown at {{ Math.round(scale * 100) }}%)</template>. {{ TARGET_NAMES[target] }} look is approximate. It's for layout sanity, not pixel accuracy. Click empty space to deselect.</p>
    </div>
  </div>
</template>

<style scoped>
.canvas-col { display: flex; flex-direction: column; min-width: 0; min-height: 0; }
.screens { display: flex; align-items: center; gap: 4px; padding: 6px 8px; border-bottom: 1px solid var(--line); flex-wrap: wrap; }
.stab { border: 1px solid var(--line); background: var(--panel); color: var(--fg); padding: 4px 10px; border-radius: 6px; cursor: pointer; font: inherit; }
.stab.on { border-color: var(--accent); box-shadow: inset 0 -2px 0 var(--accent); }
.surf { margin-right: 5px; color: var(--muted); }
.entry { margin-left: 5px; color: var(--ok); font-size: 10px; }
.add { margin-left: 6px; color: var(--muted); font-size: 12px; }
.add button { border: 0; background: none; color: var(--accent); cursor: pointer; font: inherit; padding: 2px 4px; }
.view { margin-left: auto; display: flex; gap: 6px; align-items: center; }
.seg { display: inline-flex; border: 1px solid var(--line); border-radius: 6px; overflow: hidden; }
.seg button { font: inherit; font-size: 12px; padding: 4px 9px; border: 0; background: var(--panel); color: var(--muted); cursor: pointer; }
.seg button + button { border-left: 1px solid var(--line); }
.seg button.on { background: var(--accent); color: #fff; }
.frame { font: inherit; font-size: 12px; padding: 3px; border-radius: 6px; border: 1px solid var(--line); background: var(--panel); color: var(--fg); }
.custom { display: inline-flex; align-items: center; gap: 3px; font-size: 12px; color: var(--muted); }
.custom input { width: 62px; font: inherit; font-size: 12px; padding: 3px 4px; border-radius: 6px; border: 1px solid var(--line); background: var(--panel); color: var(--fg); }
.noskin { margin: 40px auto; max-width: 460px; text-align: center; color: var(--muted); }
.stage { flex: 1; overflow: auto; padding: 28px; background: var(--stage); }
.fit { margin: 0 auto; }
.case { position: relative; transform-origin: 0 0; }
.device { position: absolute; overflow: hidden; background: #111; }
/* rugged case (generic, drawn in CSS): dark rubberised shell, black glass rim, a tan grip panel on
   one end and hardware buttons proud of the long edge */
.case.phone, .case.tablet { border-radius: 46px; background: linear-gradient(160deg, #3d4044, #232528 60%, #1b1c1e);
  box-shadow: inset 0 0 0 2px #50545a, inset 0 0 0 5px #1a1b1d, inset 0 -4px 10px rgba(0,0,0,.6), 0 16px 44px rgba(0,0,0,.45); }
.case.tablet { border-radius: 36px; }
.device.tablet, .device.phone { border-radius: 16px; box-shadow: 0 0 0 9px #070707, 0 0 0 10px #2c2e31; }
.device.phone { border-radius: 22px; }
.device.window { border-radius: 4px; box-shadow: 0 0 0 7px #070707, 0 0 0 8px #2c2e31; }
.lid { position: absolute; top: 0; border-radius: 22px 22px 10px 10px; background: linear-gradient(160deg, #3d4044, #232528 60%, #1b1c1e);
  box-shadow: inset 0 0 0 2px #50545a, inset 0 0 0 5px #1a1b1d, 0 16px 44px rgba(0,0,0,.45); }
.bump { position: absolute; width: 58px; height: 58px; background: linear-gradient(160deg, #c4b49a, #a1917a 55%, #8a7b66); box-shadow: inset 0 0 0 2px rgba(255,255,255,.18); }
.bump.tl { top: -6px; left: -6px; border-radius: 24px 6px 6px 6px; }
.bump.tr { top: -6px; right: -6px; border-radius: 6px 24px 6px 6px; }
.bump.bl { bottom: -6px; left: -6px; border-radius: 6px 6px 6px 14px; }
.bump.br { bottom: -6px; right: -6px; border-radius: 6px 6px 14px 6px; }
.webcam { position: absolute; top: 10px; left: 50%; width: 8px; height: 8px; margin-left: -4px; border-radius: 50%; background: #0b0b0b; box-shadow: 0 0 0 2px #2c2e31; }
.deck { position: absolute; left: 0; right: 0; bottom: 0; background: linear-gradient(#4a4d52, #2a2c2f 40%, #1c1d1f);
  clip-path: polygon(24px 0, calc(100% - 24px) 0, 100% 78%, calc(100% - 14px) 100%, 14px 100%, 0 78%); }
.deck .keys { position: absolute; left: 12%; right: 12%; top: 8px; height: 26px; border-radius: 3px;
  background: repeating-linear-gradient(90deg, #17181a 0 22px, transparent 22px 26px), #0e0f10; opacity: .8; }
.deck .handle { position: absolute; left: 50%; bottom: 6px; width: 30%; height: 12px; transform: translateX(-50%); border-radius: 6px;
  background: linear-gradient(160deg, #c4b49a, #8a7b66); box-shadow: inset 0 0 0 2px rgba(255,255,255,.15); }
.grip-end { position: absolute; background: linear-gradient(160deg, #c4b49a, #a1917a 55%, #8a7b66); box-shadow: inset 0 0 0 2px rgba(255,255,255,.18), inset 0 -4px 10px rgba(0,0,0,.35); }
.land .grip-end { top: 0; bottom: 0; right: 0; width: 30%; border-radius: 0 46px 46px 0; }
.port .grip-end { left: 0; right: 0; bottom: 0; height: 30%; border-radius: 0 0 46px 46px; }
.case.tablet .grip-end { border-radius: 0 36px 36px 0; }
.case.tablet.port .grip-end { border-radius: 0 0 36px 36px; }
.hw { position: absolute; background: linear-gradient(#2a2c2f, #141516); border-radius: 3px; box-shadow: 0 0 0 1px #4a4d52; }
.land .hw { top: -5px; height: 7px; }
.land .b1 { left: 18%; width: 64px; } .land .b2 { left: 30%; width: 40px; } .land .b3 { right: 12%; width: 52px; }
.port .hw { right: -5px; width: 7px; }
.port .b1 { top: 18%; height: 64px; } .port .b2 { top: 30%; height: 40px; } .port .b3 { bottom: 12%; height: 52px; }
.winbar { position: absolute; top: 0; left: 0; right: 0; height: 30px; background: #2a2a2e; display: flex; align-items: center; gap: 7px; padding: 0 10px; }
.winbar i { width: 11px; height: 11px; border-radius: 50%; background: #555; }
.winbar span { color: #aaa; font: 12px system-ui; margin-left: 10px; }
.hostbar { position: absolute; left: 0; right: 0; background: #3c3c42; display: flex; gap: 10px; align-items: center; padding: 0 14px; }
.hostbar span { width: 46px; height: 60%; background: rgba(255,255,255,.09); border-radius: 3px; }
.launch { display: flex; align-items: center; justify-content: center; background: rgba(255,255,255,.16) !important; box-shadow: inset 0 0 0 1px rgba(255,255,255,.35); }
.launch img { max-width: 80%; max-height: 80%; }
.launch b { color: #eee; font: 600 15px system-ui; }
.maptools { position: absolute; top: 12px; left: 12px; display: flex; gap: 6px; }
.maptools .launch { width: 44px; height: 44px; border-radius: 6px; background: rgba(0,0,0,.55) !important; }
.hostbar.webtak { background: #1f2327; }
.hostbar.takx { background: #262626; border-bottom: 1px solid #3a3a3a; }
.hostbar.takx span { width: 58px; height: 64%; }
/* ATAK: dark aerial-imagery tones with a couple of roads, under the host widgets */
.map.atak { background-color: #3b4636; background-image:
  linear-gradient(118deg, transparent 47%, rgba(205,195,170,.22) 47.3% 47.9%, transparent 48.2%),
  linear-gradient(28deg, transparent 61%, rgba(205,195,170,.16) 61.2% 61.6%, transparent 61.9%),
  radial-gradient(ellipse 30% 22% at 22% 30%, #2f3d2c, transparent 70%),
  radial-gradient(ellipse 26% 30% at 70% 68%, #56604a, transparent 70%),
  radial-gradient(ellipse 18% 14% at 52% 22%, #6b6a58, transparent 70%),
  radial-gradient(ellipse 22% 18% at 35% 80%, #2b3a2e, transparent 70%); }
/* TAKX opens on a 3D globe against space */
.map.takx { background: radial-gradient(circle at 78% 115%, #2f6ea5 0 30%, #10263d 31%, #000 33%); }
.map { position: absolute; inset: 0; background-color: #4a5a43;
  background-image: repeating-linear-gradient(0deg, transparent 0 59px, rgba(255,255,255,.08) 59px 60px),
    repeating-linear-gradient(90deg, transparent 0 59px, rgba(255,255,255,.08) 59px 60px); }
.map > span { position: absolute; left: 16px; bottom: 12px; color: rgba(255,255,255,.4); font: 12px system-ui; }
.pane { position: absolute; bottom: 0; display: flex; flex-direction: column; }
.pane.right { right: 0; box-shadow: -4px 0 12px rgba(0,0,0,.5); }
.pane.float { left: 24px; bottom: auto; max-height: calc(100% - 120px); border-radius: 8px; overflow: hidden; box-shadow: 0 8px 30px rgba(0,0,0,.6); }
.x { color: #888; font-weight: 400; }
.scroll { flex: 1; overflow: auto; padding: 22px 10px 10px; display: flex; flex-direction: column; }
.dialog-wrap { position: absolute; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,.55); display: flex; align-items: center; justify-content: center; }
.dialog { max-height: 86%; display: flex; flex-direction: column; border-radius: 6px; overflow: hidden; box-shadow: 0 8px 30px rgba(0,0,0,.6); }
.note { text-align: center; color: var(--muted); font-size: 12px; margin-top: 18px; }
</style>
