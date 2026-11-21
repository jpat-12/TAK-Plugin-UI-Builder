<script setup lang="ts">
// "Show me" animation: a ghost cursor acts out the step on the real UI. Everything is
// pointer-events: none, so the user can do the real thing at any moment, even mid-animation.
// Positions are re-resolved from live selectors every frame (panels scroll, layout shifts).
// Plays LOOPS times then rests; the tour card's "Show me" button restarts it via :key.
import { onBeforeUnmount, onMounted, reactive } from 'vue';
import { PANE, type Demo } from './steps';

const props = defineProps<{ demo: Demo }>();
const emit = defineEmits<{ finished: [] }>();

const LOOPS = 3;
const REDUCED = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

const v = reactive({
  show: false, x: 0, y: 0, press: false,
  chip: '' as string, chipShow: false,
  ripple: false, rx: 0, ry: 0, rKey: 0,
  bubble: '', bubbleShow: false, bx: 0, by: 0,
  keys: [] as string[], keyOn: -1, kx: 0, ky: 0,
});

type Pt = { x: number; y: number };
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const lerp = (a: Pt, b: Pt, t: number): Pt => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const seg = (p: number, a: number, b: number) => Math.min(1, Math.max(0, (p - a) / (b - a)));

function el(sel: string): Element | null {
  try { return document.querySelector(sel); } catch { return null; }
}
function center(sel: string): Pt | null {
  const e = el(sel);
  if (!e) return null;
  const r = e.getBoundingClientRect();
  if (!r.width && !r.height) return null;
  return { x: r.left + Math.min(r.width / 2, 60), y: r.top + r.height / 2 };
}
/** Drop point for the pane: just below its last component, so it reads as "add to the end" */
function dropPoint(sel: string): Pt | null {
  const e = el(sel);
  if (!e) return null;
  const r = e.getBoundingClientRect();
  const kids = e.querySelectorAll(':scope > div > .layout > .cn, :scope > .layout > .cn');
  const last = kids[kids.length - 1]?.getBoundingClientRect();
  const y = last ? Math.min(last.bottom + 28, r.bottom - 20) : r.top + 40;
  return { x: r.left + r.width / 2, y };
}
const labelOf = (sel: string) => (el(sel)?.textContent ?? '').replace('≈', '').trim();

function duration(): number {
  const d = props.demo;
  if (d.kind === 'drag') return 2600;
  if (d.kind === 'type') return 1400 + d.text.length * 55 + 900;
  if (d.kind === 'keys') return 2200;
  return 1700;
}

let raf = 0;
let start = 0;
function tick(now: number) {
  if (!start) start = now;
  const dur = duration();
  const loop = Math.floor((now - start) / dur);
  if (loop >= LOOPS) { reset(); emit('finished'); return; }
  frame(((now - start) % dur) / dur);
  raf = requestAnimationFrame(tick);
}

function reset() {
  Object.assign(v, { show: false, press: false, chipShow: false, ripple: false, bubbleShow: false, keyOn: -1, keys: [] });
}

// The ripple must mount ONCE per press (re-keying it every frame would restart its CSS
// animation forever), so frames only request it and commitRipple() edge-detects.
let wantRipple: Pt | null = null;
function ripple(p: Pt) { wantRipple = p; }
function commitRipple() {
  if (wantRipple && !v.ripple) { v.rKey++; v.rx = wantRipple.x; v.ry = wantRipple.y; }
  v.ripple = !!wantRipple;
  wantRipple = null;
}

function frame(p: number) {
  draw(p);
  commitRipple();
}

function draw(p: number) {
  const d = props.demo;
  if (d.kind === 'drag') {
    const a = center(d.from);
    const b = d.to === PANE ? dropPoint(d.to) : center(d.to);
    if (!a || !b) return reset();
    const start = { x: a.x + 70, y: a.y + 50 };
    let pt: Pt;
    if (p < 0.15) pt = lerp(start, a, ease(seg(p, 0, 0.15)));
    else if (p < 0.25) pt = a;
    else if (p < 0.72) pt = lerp(a, b, ease(seg(p, 0.25, 0.72)));
    else pt = b;
    v.show = p < 0.92;
    v.press = p >= 0.18 && p < 0.75;
    v.chipShow = p >= 0.22 && p < 0.75;
    v.chip = labelOf(d.from);
    if (p >= 0.74 && p < 0.9) ripple(b);
    v.x = pt.x; v.y = pt.y;
    return;
  }
  const t = center(d.at);
  if (!t) return reset();
  const from = { x: t.x + 80, y: t.y + 60 };
  if (d.kind === 'click') {
    const pt = p < 0.45 ? lerp(from, t, ease(seg(p, 0, 0.45))) : t;
    v.show = p < 0.9;
    v.press = p >= 0.5 && p < 0.62;
    if (p >= 0.52 && p < 0.8) ripple(t);
    v.x = pt.x; v.y = pt.y;
    return;
  }
  if (d.kind === 'type') {
    const moveEnd = 0.2;
    const pt = p < moveEnd ? lerp(from, t, ease(seg(p, 0, moveEnd))) : t;
    v.show = p < 0.95;
    v.press = p >= moveEnd && p < moveEnd + 0.06;
    if (p >= moveEnd && p < moveEnd + 0.15) ripple(t);
    const typing = seg(p, moveEnd + 0.08, 0.85);
    v.bubbleShow = p >= moveEnd + 0.05 && p < 0.97;
    v.bubble = d.text.slice(0, Math.round(typing * d.text.length));
    const r = el(d.at)!.getBoundingClientRect();
    v.bx = r.left; v.by = r.top - 8;
    v.x = pt.x; v.y = pt.y;
    return;
  }
  // keys: keycaps appear beside the target and light up in order
  const r = el(d.at)!.getBoundingClientRect();
  v.show = false;
  v.keys = d.keys;
  // anchored to the target's top-right corner, inside it, so it never spills into other panels
  v.kx = r.right - 6; v.ky = r.top - 6;
  // press keys one after another (each stays held, like a real chord), release together
  v.keyOn = p < 0.15 || p > 0.85 ? -1 : Math.min(d.keys.length - 1, Math.floor((p - 0.15) / 0.22));
}

onMounted(() => {
  if (REDUCED) { frame(props.demo.kind === 'drag' ? 0.5 : 0.6); return; } // one still frame, no motion
  raf = requestAnimationFrame(tick);
});
onBeforeUnmount(() => cancelAnimationFrame(raf));
</script>

<template>
  <div class="demo" aria-hidden="true">
    <div v-if="v.ripple" :key="v.rKey" class="ripple" :style="{ left: v.rx + 'px', top: v.ry + 'px' }" />
    <div v-if="v.chipShow" class="chip" :style="{ left: v.x + 14 + 'px', top: v.y + 12 + 'px' }">{{ v.chip }}</div>
    <div v-if="v.bubbleShow" class="bubble" :style="{ left: v.bx + 'px', top: v.by + 'px' }">{{ v.bubble }}<i class="caret" /></div>
    <div v-if="v.keys.length" class="keys" :style="{ left: v.kx + 'px', top: v.ky + 'px' }">
      <template v-for="(k, i) in v.keys" :key="k">
        <span v-if="i" class="plus">+</span>
        <kbd :class="{ on: v.keyOn >= i }">{{ k }}</kbd>
      </template>
    </div>
    <svg v-if="v.show" class="cursor" :class="{ press: v.press }" :style="{ left: v.x + 'px', top: v.y + 'px' }"
      width="26" height="30" viewBox="0 0 26 30">
      <path d="M3 2 L3 24 L9 18.5 L13 27.5 L17 25.8 L13 17 L21 17 Z" fill="#fff" stroke="#1f1300" stroke-width="1.6" stroke-linejoin="round" />
    </svg>
  </div>
</template>

<style scoped>
.demo { position: fixed; inset: 0; z-index: 62; pointer-events: none; }
.cursor { position: fixed; margin: -2px 0 0 -3px; filter: drop-shadow(0 2px 3px rgba(0,0,0,.45)); transition: transform .08s; transform-origin: 3px 2px; }
.cursor.press { transform: scale(.82); }
.chip { position: fixed; padding: 4px 10px; font: 600 12px/1.2 system-ui, sans-serif; color: #1f1300; background: #fcd34d;
  border: 1px solid #f59e0b; border-radius: 6px; box-shadow: 0 6px 16px rgba(0,0,0,.3); opacity: .95; white-space: nowrap; }
.ripple { position: fixed; width: 14px; height: 14px; margin: -7px 0 0 -7px; border-radius: 50%; border: 3px solid #f59e0b; animation: ripple .55s ease-out forwards; }
@keyframes ripple { to { transform: scale(3.6); opacity: 0; } }
.bubble { position: fixed; transform: translateY(-100%); padding: 5px 10px; font: 13px/1.3 system-ui, sans-serif; color: #1f1300; background: #fde68a;
  border: 1px solid #f59e0b; border-radius: 8px 8px 8px 2px; box-shadow: 0 6px 16px rgba(0,0,0,.25); white-space: nowrap; max-width: 420px; overflow: hidden; }
.caret { display: inline-block; width: 2px; height: 1em; background: #1f1300; margin-left: 1px; vertical-align: -2px; animation: blink .8s steps(2) infinite; }
@keyframes blink { 50% { opacity: 0; } }
.keys { position: fixed; transform: translate(-100%, -100%); display: flex; align-items: center; gap: 4px; }
kbd { font: 600 13px/1 system-ui, sans-serif; padding: 7px 10px; min-width: 30px; text-align: center; border-radius: 6px; color: #1f1300;
  background: #fff7e0; border: 1px solid #d6a440; box-shadow: 0 3px 0 #b7862a; transition: all .1s; }
kbd.on { background: #fcd34d; transform: translateY(2px); box-shadow: 0 1px 0 #b7862a; }
.plus { color: #f59e0b; font-weight: 700; text-shadow: 0 1px 2px rgba(0,0,0,.4); }
</style>
