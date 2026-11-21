# TAK Plugin UI Builder — Plan (v0.3, 2026-11-10)

> Status: **Phases 0–4 built (2026-11-10)**: spec, designer (+ skins, spell check, templates, tour),
> handoff export, compiler-verified code generators, and Claude screen drafting. TAKX added from its
> 5.8.0 SDK (Phase 5); only the "Build plugin" button remains deferred.

## 1. What this is (one sentence)

A browser-based drag-and-drop **UI designer for TAK plugins** (ATAK, WinTAK, WebTAK,
CloudTAK, TAKX). Instead of hand-describing a plugin's screens to a coding agent in
prose, you lay out the panes, buttons, inputs and lists visually, label what each control
should *do*, and export a **handoff package** that a coding agent (Claude Code etc.) turns
into a real plugin using your existing per-platform templates.

## 2. The key insight

**One platform-neutral UI spec is the canonical record, and every output is a projection
of it.** The designer edits only `ui-spec.json`. The canvas preview, the per-platform skins,
the agent handoff doc, and any generated layout code are all *computed* from that spec. None
of them hold an editable copy. This is the same one-store rule StatusBoard follows.

The consequence is the main design constraint: **layouts are structural, not pixel-based.**
An ATAK drop-down pane resizes (half/full width, portrait/landscape), a CloudTAK panel is a
fixed-width sidebar, and WinTAK docks. Absolute X/Y positioning would not survive any of
those. So the canvas uses nested **stacks, rows, tabs and sections** (like Figma
auto-layout). These map cleanly to Android `LinearLayout`, WPF `StackPanel`/`Grid`, and
flexbox in Vue/DOM.

## 3. What the coding agent receives (the product's actual output)

A `.zip` handoff package per project:

```
<plugin-name>-handoff/
  HANDOFF.md        — the agent prompt: target platform(s), which template repo to start
                      from, conventions/rules for that platform, then every screen
                      described element by element, plus the action TODO list and
                      acceptance checklist
  ui-spec.json      — the machine-readable canonical spec (versioned schema: takui/v1)
  mockups/*.png     — rendered screenshot of each screen in the target platform's skin
  scaffold/<target>/ — (Phase 3) generated layout code: ATAK res/layout XML, WinTAK XAML,
                      CloudTAK Vue SFC, WebTAK DOM module. Layout only, with behavior stubs
```

`HANDOFF.md` points the agent at the templates you already have, so it doesn't invent a
build setup:

| Target | Starting point the agent is told to use |
|---|---|
| ATAK 5.6 / 5.7 | `TAK-PluginSuite-IndianaUniversity/ATAK5.x-Template` + `tools/new-atak-plugin.ps1` |
| CloudTAK | `CloudTAK-Plugin_Development/template` + its AGENTS.md rules (R1–R8) |
| WebTAK | `WebTAK-Plugin-Channels` pattern (ES modules → `build.js` → single IIFE) |
| WinTAK 5.6 / 5.7 | `TAK-PluginSuite-FeatureLink/WinTAK5.x` (XAML Views + csproj) |
| TAKX | [TAK-Product-Center/TAKX](https://github.com/TAK-Product-Center/TAKX): Java 17/Gradle desktop app (WinTAK + RaptorX successor); plugins are jars against the `Platform` module API. **Verified 2026-11-10 from the 5.8.0 SDK: Java 17 + Swing**; app plugins (`@AppPlugin`, `AAppPlugin`) mount JPanels via `IUISpaceManager`. Starting point: the SDK's `takx-raven-plugin-offline` project |

## 4. The spec model (`takui/v1`)

```
Project
  meta:     name, packageId (e.g. org.ilwg.myplugin), version, description, targets[]
  state:    named fields: { key, type (string|number|bool|enum|list|point|contact),
            default, persisted? }. This is the plugin's data model, and inputs bind to it.
  actions:  named behaviors: { id, label, intent (plain-English "what it does"),
            kind (cot-send | http | map-pick | navigate | custom), params }
  entry:    how the user opens it, per target: toolbar icon, radial menu item, CloudTAK
            home-menu icon, WinTAK ribbon button, WebTAK menu entry
  screens[]: { id, title, surface (dropdown-pane | dialog | tab | settings), root: Node }

Node = container (stack | row | tabs | section | collapsible | scroll)
     | element (see §5), each with { id, props, bind?: stateKey, onX?: actionId,
       visibleWhen?: stateExpr, targetOverrides?: {atak: {...}, cloudtak: {...}} }
```

Behavior is **declared, not coded**. A button says `onClick: "send-status-cot"`, and that
action's `intent` field is where you write "Send a CoT with my selected status to the
team". The builder never tries to be a visual programming language; writing the logic is
the agent's job.

## 5. Component palette (v1)

**Generic:** Label/Heading, Button, Icon button, Text input, Number input, Text area,
Dropdown, Checkbox, Toggle, Radio group, Slider, Date/time, Color picker, Image/Icon,
Divider, Progress bar, Status badge (color-mapped enum), List (repeating item template),
Table, Empty-state placeholder.

**TAK-specific** (these make the tool worth more than a generic UI builder):
Map-point picker ("tap map to set location"), Contact/team picker, Map-item reference,
Callsign display, MGRS/lat-lon field, CoT-type picker, Data package attach, Open-on-map
button, Chat/GeoChat send.

Every component carries a **support matrix** (native / approximated / unsupported per
target). The builder warns when a design uses something a selected target can't do well,
for example a color picker on WebTAK.

## 6. The builder app

- **Stack:** Vite + Vue 3 + TypeScript + Pinia, the same Vue stack as your CloudTAK work.
  Drag and drop via `vuedraggable` (SortableJS). No backend in v1: projects save to
  localStorage under a versioned key (`takui:v1`), with JSON import/export as the real
  save/share path.
- **Layout:** left = palette + screen list; center = canvas inside a **device frame**
  (ATAK phone/tablet half-pane, CloudTAK sidebar, WinTAK dock, WebTAK floating panel) with
  a target-skin switcher; right = property inspector (props, binding, action, visibility,
  per-target overrides); bottom drawer = State and Actions editors.
- **Skins** approximate each platform's look (ATAK dark Android, CloudTAK Tabler dark,
  WinTAK, WebTAK). They're labeled "approximate". They exist for layout sanity, not
  pixel fidelity.
- **Export:** zip via JSZip, PNGs via html-to-image, `HANDOFF.md` generated from a template.

```
src/
  spec/        types.ts (takui/v1), catalog.ts (component registry: props, bind types,
               events, support matrix), schema.ts, validate.ts, load.ts (migrations)
  store/       project.ts: the one store; all mutations + undo/redo go through here
  palette/     palette UI over spec/catalog.ts (grouping, search, drag sources)
  canvas/      drag/drop tree editor, selection, device frames
  skins/       per-target renderers of a Node (preview only)
  inspector/   property panels
  export/      handoff.ts (HANDOFF.md), mockups.ts, zip.ts
  emitters/    (Phase 3) atak-xml.ts, wintak-xaml.ts, cloudtak-vue.ts, webtak-dom.ts
test/fixtures/ sample specs; emitter + handoff snapshot tests
```

## 7. Phases

| Phase | Delivers | Done when |
|---|---|---|
| **0. Spec** ✅ | `takui/v1` types + JSON schema + 2 fixture projects (one simple, one modeled on IU Event CAD) | Fixtures validate; you sign off on the model |
| **1. Designer MVP** ✅ | Canvas, palette (full catalog), inspector, the ATAK skin, save/load/import/export JSON, undo/redo, *plus State/Actions editors pulled forward from Phase 2* (binding is untestable without them) | You can rebuild an existing plugin's main pane in under 10 min |
| **2. Handoff** ✅ | `HANDOFF.md` generator, PNG mockups, zip export, support-matrix warnings | An agent given only the zip produces a building plugin whose UI matches the mockup (tested on one real plugin) |
| **3. Scaffolds** ✅ | ATAK `res/layout` XML emitter first, then CloudTAK, WinTAK, WebTAK, plus their skins and the TAK-specific components | Generated ATAK layout drops into the IU template and builds without edits |
| **4. Text → draft layout** ✅ | Describe a screen in words; Claude drafts the node tree onto the canvas (you edit from there) | Draft is valid `takui/v1` and is editable like any hand-built screen |
| **5. TAKX** ✅ **+ 'Build plugin'** (deferred) | TAKX skin + Swing emitter (done 2026-11-10, javac-verified against the documented API); a button that sends the handoff to an agent and returns code (deferred) | TAKX: compiles in tests. Build plugin: deferred by decision |

## 8. Testing

Emitters and the handoff generator are pure functions (spec → text), so they get
**snapshot tests over fixture specs** (Vitest). They're the highest-leverage tests here. Spec
migrations get tests as well. The canvas UI gets a `docs/VERIFY.md` manual smoke
sequence, with no UI automation in v1.

## 9. Deliberate non-goals (v1)

- No visual logic or flow programming. Behavior is plain-English intent for the agent.
- No pixel-perfect platform rendering.
- No round-trip editing of generated code. The spec stays the source of truth; regenerate
  rather than reverse-parse.
- No AI calls in Phases 0–3. Phase 2 adds a **Copy prompt** button (a ready-to-paste Claude Code prompt + spec), which needs no API. AI calls start in Phase 4.

## 10. Risks

- **Platform fidelity gaps.** WebTAK's plugin surface is thin (a floating panel injected via
  `loadScript`). TAKX's generated code is checked against Javadoc-derived stubs, not a real install. Mitigation: the support matrix plus per-target overrides.
- **Spec churn.** The schema will change during Phase 1. Mitigation: versioned schema plus
  migration functions from day one.
- **OneDrive + git.** This repo lives in OneDrive (see workspace CLAUDE.md §10). Consider
  moving it before `node_modules` lands here, because OneDrive syncing 30k files is painful.

## 11. Decisions

| # | Decision (2026-11-10) |
|---|---|
| D1 | Targets: ATAK, WinTAK, WebTAK, CloudTAK, TAKX (TAK-Product-Center/TAKX; supported 2026-11-10 from its 5.8.0 SDK: Java 17 + Swing) |
| D2 | First skin + first emitter: **ATAK** |
| D3 | Handoff first (spec + HANDOFF.md + mockups); generated code comes in Phase 3 |
| D4 | AI: pure design tool + Copy-prompt (Phase 2); text → draft layout (Phase 4); "Build plugin" button later (Phase 5) |
| D5 | Users: you **plus public-safety people and vibecoders who don't write code**. So: plain-language labels, starter templates (e.g. "status board", "incident form", "team list"), inline hints, and a HANDOFF.md written so a beginner can paste it into Claude Code and succeed |
| D6 | Hosting: **static site** (Vite build). Runs locally or on GitHub Pages / your infra. No backend, so no project data leaves the browser |
| D7 | **One design, all targets**: a single spec with per-target overrides and support-matrix warnings |
| D8 | Repo stays in OneDrive; `node_modules/` and `dist/` gitignored |

## 12. Proposed defaults (confirm or change during proofread)

1. **Settings screens**: yes. A `settings` screen type emits a native ATAK PreferenceScreen
   (Phase 3) and plain panels on the other targets.
2. **Phase 4 API key**: the user pastes their own key into the browser, stored only in
   localStorage and sent only to api.anthropic.com. No proxy, which keeps the site static (D6).
3. **Name**: "TAK Plugin UI Builder" (repo `TAK-Plugin-UI-Builder`).
4. **Starter templates in Phase 2** (moved up because of D5): 3 starter projects built from the fixtures.
5. **License**: MIT (match FeatureLink?).
