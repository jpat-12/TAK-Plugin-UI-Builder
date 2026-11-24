<script setup lang="ts">
// Export: readiness checks → handoff settings → preview → zip / prompt / HANDOFF.md.
// Errors block export (PLAN.md: the agent can't build from a broken spec); warnings and
// spelling don't. Mockups are rendered by mounting each screen off-screen in mockup mode and
// capturing it with html-to-image, so they come from the same rendering code as the canvas.
import { computed, nextTick, ref } from 'vue';
import { toBlob } from 'html-to-image';
import { useProject } from '../store/project';
import { FRAMES, SKINNED } from '../skins/frames';
import { themeVars } from '../skins/theme';
import { bannerFor } from '../skins/banner';
import BannerView from '../skins/BannerView.vue';
import { frameKeyFor } from '../canvas/view';
import { TARGET_NAMES } from '../spec/validate';
import type { Screen, Target } from '../spec/types';
import CanvasNode from '../canvas/CanvasNode.vue';
import { buildHandoff, buildPrompt } from './handoff';
import { buildZip, slugOf, tabsOf, type RenderedMockup } from './package';
import { exportOpen } from './state';

const store = useProject();
const p = computed(() => store.project);
const today = () => new Date().toISOString().slice(0, 10);

const errors = computed(() => store.issues.filter((i) => i.severity === 'error'));
const warnings = computed(() => store.issues.filter((i) => i.severity === 'warning'));
const blocked = computed(() => errors.value.length > 0);

const mockTargets = computed(() => p.value.meta.targets.filter((t) => SKINNED.includes(t)));
const withMockups = ref(true);
const withScaffold = ref(true);
const codeTargets = computed(() => p.value.meta.targets);
const preview = computed(() => buildHandoff(p.value, { generatedAt: today() }));

const busy = ref('');
const done = ref('');

// ---- mockup rendering ----
const job = ref<{ target: Target; screen: Screen; tab?: number } | null>(null);
const stage = ref<HTMLElement | null>(null);
const paneWidth = (t: Target) => Math.min(FRAMES[t]![frameKeyFor(t)]!.pane, 560);
const frame = () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));

async function renderMockups(): Promise<RenderedMockup[]> {
  const out: RenderedMockup[] = [];
  // tabbed screens render once per tab, so the agent sees every tab's content
  type Shot = { screen: Screen; tab?: number; label?: string };
  const shots = p.value.screens.flatMap((screen): Shot[] => {
    const tabs = tabsOf(screen);
    return tabs.length ? tabs.map((label, tab) => ({ screen, tab, label })) : [{ screen }];
  });
  const total = mockTargets.value.length * shots.length;
  for (const target of mockTargets.value) {
    for (const { screen, tab, label } of shots) {
      busy.value = `Rendering mockup ${out.length + 1} of ${total}…`;
      job.value = { target, screen, tab };
      await nextTick();
      await frame();
      const blob = await toBlob(stage.value!, { pixelRatio: 2 });
      if (blob) out.push({ target, screen: screen.id, tab, label, png: new Uint8Array(await blob.arrayBuffer()) });
    }
  }
  job.value = null;
  return out;
}

function download(blob: Blob, name: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

async function onZip() {
  done.value = '';
  try {
    const shots = withMockups.value ? await renderMockups() : [];
    busy.value = 'Building zip…';
    download(await buildZip(p.value, today(), shots, withScaffold.value), `${slugOf(p.value)}-handoff.zip`);
    done.value = `Downloaded ${slugOf(p.value)}-handoff.zip. Unzip it, open the folder in Claude Code, and paste PROMPT.md.`;
  } catch (e) {
    console.warn('[takui] export failed', e);
    done.value = `Export failed: ${(e as Error).message}`;
  } finally {
    busy.value = '';
    job.value = null;
  }
}

async function onCopyPrompt() {
  const text = buildPrompt(p.value, 'inline', buildHandoff(p.value, { generatedAt: today() }));
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // clipboard API blocked (permissions / insecure context): fall back to a selectable textarea copy
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
  done.value = `Copied a ${Math.round(text.length / 1000)}k-character prompt. Paste it into Claude Code in an empty folder. (No mockups in this mode; use the zip for those.)`;
}

function onMd() {
  download(new Blob([buildHandoff(p.value, { generatedAt: today() })], { type: 'text/markdown' }), 'HANDOFF.md');
}
function goToProblems() {
  exportOpen.value = false;
  const first = errors.value[0];
  if (first?.ref) store.select(first.ref);
}
</script>

<template>
  <div v-if="exportOpen" class="scrim" @click.self="!busy && (exportOpen = false)">
    <div class="dlg" role="dialog" aria-label="Export handoff">
      <header>
        <h2>Hand off to a coding agent</h2>
        <button class="x" aria-label="Close" :disabled="!!busy" @click="exportOpen = false">✕</button>
      </header>

      <div class="cols">
        <section class="left">
          <h3>Ready?</h3>
          <ul class="checks">
            <li :class="blocked ? 'bad' : 'good'">
              <template v-if="blocked">● {{ errors.length }} error{{ errors.length === 1 ? '' : 's' }}: fix before exporting.
                <button class="link" @click="goToProblems">Show me</button>
                <ul class="errs"><li v-for="(e, i) in errors.slice(0, 4)" :key="i">{{ e.message }}</li></ul>
              </template>
              <template v-else>✓ No errors</template>
            </li>
            <li :class="warnings.length ? 'meh' : 'good'">{{ warnings.length ? `▲ ${warnings.length} warning(s): the agent will see them as-is` : '✓ No warnings' }}</li>
            <li :class="store.spelling.length ? 'meh' : 'good'">{{ store.spelling.length ? `✎ ${store.spelling.length} possible typo(s): they'll ship into the plugin's text` : '✓ No typos found' }}</li>
          </ul>

          <h3>Notes for the agent <small>optional · saved with the project</small></h3>
          <textarea rows="4" spellcheck="true" :value="p.handoff?.notes ?? ''"
            placeholder="e.g. Target ATAK 5.6. CoT goes to the ILWG TAK Server. Ask Jon before adding any network calls."
            @input="store.setHandoffNotes(($event.target as HTMLTextAreaElement).value)" />

          <h3>Start from <small>repo, folder or URL per platform · optional</small></h3>
          <label v-for="t in p.meta.targets" :key="t" class="starter">
            <span>{{ TARGET_NAMES[t] }}</span>
            <input :value="p.handoff?.starters?.[t] ?? ''" spellcheck="false"
              :placeholder="t === 'atak' ? 'e.g. TAK-PluginSuite-IndianaUniversity/ATAK5.6-Template' : t === 'cloudtak' ? 'e.g. CloudTAK-Plugin_Development/template' : 'official SDK template'"
              @input="store.setStarter(t, ($event.target as HTMLInputElement).value)" />
          </label>

          <h3>Mockups</h3>
          <label class="chk"><input v-model="withMockups" type="checkbox" :disabled="!mockTargets.length" />
 Include screenshots ({{ p.screens.length }} screen{{ p.screens.length === 1 ? '' : 's' }}, every tab, × {{ mockTargets.map((t) => TARGET_NAMES[t]).join(', ') || 'no previewable platform' }})</label>

          <label class="chk"><input v-model="withScaffold" type="checkbox" :disabled="!codeTargets.length" />
            Include generated code ({{ codeTargets.map((t) => TARGET_NAMES[t]).join(', ') || 'none for these platforms' }})</label>

          <div class="actions">
            <button class="primary" :disabled="blocked || !!busy" @click="onZip">⬇ Download handoff (.zip)</button>
            <button :disabled="blocked || !!busy" title="One self-contained prompt: HANDOFF.md + spec, no images" @click="onCopyPrompt">⧉ Copy prompt for Claude Code</button>
            <button class="link" :disabled="!!busy" @click="onMd">Just HANDOFF.md</button>
          </div>
          <p v-if="busy" class="busy">{{ busy }}</p>
          <p v-else-if="done" class="done">{{ done }}</p>
          <p class="muted">The zip holds <code>HANDOFF.md</code>, <code>ui-spec.json</code>, <code>PROMPT.md</code>, <code>mockups/</code><template v-if="p.entry.iconImage">, <code>assets/icon.png</code></template> and <code>scaffold/</code>.</p>
        </section>

        <section class="right">
          <h3>Preview: HANDOFF.md</h3>
          <pre class="md">{{ preview }}</pre>
        </section>
      </div>
    </div>

    <!-- off-screen mockup stage: one screen, one platform, no editor chrome -->
    <div v-if="job" class="stage-wrap" aria-hidden="true">
      <div ref="stage" class="mock skin" :class="['skin-' + job.target, job.screen.surface]" :style="{ width: paneWidth(job.target) + 'px', ...themeVars(p.theme) }">
        <div :class="job.screen.surface === 'dialog' ? 'd-title' : 'p-title'">
          <span>{{ job.screen.surface === 'settings' && job.target === 'atak' ? `Settings › ${job.screen.title}` : job.screen.title }}</span>
          <span v-if="job.screen.surface !== 'dialog'" class="mx">✕</span>
        </div>
        <BannerView v-if="bannerFor(p, job.screen)" :look="bannerFor(p, job.screen)!" />
        <div class="mbody"><CanvasNode :node="job.screen.root" :ctx="{ project: p }" is-root ghost mockup :target="job.target" :tab="job.tab" /></div>
        <div v-if="job.screen.surface === 'dialog'" class="d-buttons">
          <template v-if="job.target === 'atak'"><span>CANCEL</span><span>OK</span></template>
          <template v-else><span class="k-btn">Cancel</span><span class="k-btn primary">OK</span></template>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.scrim { position: fixed; inset: 0; background: rgba(0, 0, 0, .45); display: flex; align-items: center; justify-content: center; z-index: 50; padding: 16px; }
.dlg { background: var(--panel); color: var(--fg); border-radius: 10px; width: min(1100px, 100%); max-height: 92vh; display: flex; flex-direction: column; padding: 14px 18px; box-shadow: 0 20px 60px rgba(0,0,0,.4); }
header { display: flex; justify-content: space-between; align-items: center; }
h2 { margin: 0; font-size: 18px; }
h3 { margin: 14px 0 6px; font-size: 12px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); }
h3 small { text-transform: none; letter-spacing: 0; font-weight: 400; }
.x { border: 0; background: none; color: var(--muted); font-size: 16px; cursor: pointer; }
.cols { display: grid; grid-template-columns: 380px minmax(0, 1fr); gap: 18px; min-height: 0; flex: 1; }
@media (max-width: 860px) { .cols { grid-template-columns: 1fr; overflow: auto; } }
.left { overflow: auto; padding-right: 4px; }
.right { display: flex; flex-direction: column; min-height: 0; }
.checks { list-style: none; padding: 0; margin: 0; font-size: 13px; }
.checks > li { padding: 3px 0; }
.good { color: var(--ok); } .bad { color: var(--err); } .meh { color: var(--warn); }
.errs { margin: 4px 0 0 14px; padding: 0; font-size: 12px; color: var(--fg); }
textarea, .starter input { font: inherit; font-size: 12px; width: 100%; padding: 5px 7px; border: 1px solid var(--line); border-radius: 6px; background: var(--bg); color: var(--fg); }
.starter { display: grid; grid-template-columns: 80px 1fr; gap: 6px; align-items: center; margin: 4px 0; font-size: 12px; }
.chk { display: flex; gap: 6px; font-size: 12px; align-items: center; }
.actions { display: flex; flex-direction: column; gap: 6px; margin-top: 16px; }
button { font: inherit; font-size: 13px; padding: 7px 12px; border: 1px solid var(--line); border-radius: 6px; background: var(--bg); color: var(--fg); cursor: pointer; }
button:disabled { opacity: .45; cursor: default; }
.primary { background: var(--accent); border-color: var(--accent); color: #fff; font-weight: 600; }
.link { border: 0; background: none; color: var(--accent); padding: 2px 0; font-size: 12px; text-align: left; }
.busy { color: var(--accent); font-size: 12px; } .done { color: var(--ok); font-size: 12px; }
.muted { color: var(--muted); font-size: 11px; }
.md { flex: 1; min-height: 300px; overflow: auto; margin: 0; padding: 10px; background: var(--bg); border: 1px solid var(--line); border-radius: 6px; font: 11px/1.5 ui-monospace, Consolas, monospace; white-space: pre-wrap; }
.stage-wrap { position: fixed; left: -20000px; top: 0; }
.mock { display: flex; flex-direction: column; }
.mock .mbody { padding: 22px 10px 12px; display: flex; flex-direction: column; }
.mock .mx { color: #888; font-weight: 400; }
</style>
