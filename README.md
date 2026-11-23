# TAK Plugin UI Builder

A browser-based drag-and-drop designer for TAK plugin UIs (ATAK, WinTAK, WebTAK, CloudTAK,
TAKX). It replaces describing a plugin's screens to a coding agent in prose: you lay out
the panes, buttons, inputs and lists visually and write what each control should *do*.
The builder then exports a handoff package that a coding agent turns into a real plugin
using the existing per-platform templates.

Built for public-safety people and vibecoders as much as for developers.

**Use it online:** https://jpat-12.github.io/TAK-Plugin-UI-Builder/ (deployed from `main` by
`.github/workflows/pages.yml`). Your designs autosave in your own browser; ✨ Describe… uses
your own Claude API key, entered in the browser and never sent anywhere but the API.

> **Status (2026-11-10): Phases 0–4 done.** You can describe, design, generate and hand off a plugin:
> - **✨ Describe…**: say what a screen should do in plain words and Claude (claude-opus-5-5) drafts it,
>   using your own Anthropic API key (kept in your browser)
> - designer with ATAK, CloudTAK, WinTAK and WebTAK previews, spell check, templates and a guided tour
> - **generated code** for ATAK, CloudTAK, WinTAK and WebTAK, each checked by that platform's real
>   compiler or runtime in the test suite (see the Code tab)
> - **Export for agent…** produces a zip (HANDOFF.md, ui-spec.json, PROMPT.md, per-tab mockups,
>   scaffold/) or copies one self-contained prompt for Claude Code
>
> **TAKX** is supported too (added from the TAKX 5.8.0 SDK: Swing panels mounted through `IUISpaceManager`).
> The "Build plugin" button is still deferred by decision. **New here?** Click **Tour**, or read
> [docs/WALKTHROUGH.md](docs/WALKTHROUGH.md).
>
> **2026-11-23:** grid, alert banner, stat tile, timer and loading components plus a `notify` action,
> from a survey of 44 real TAK plugins on GitHub ([docs/PLUGIN_SURVEY.md](docs/PLUGIN_SURVEY.md)), and a
> Mass Casualty Triage template that uses them all.

## The key insight

**One platform-neutral spec file (`takui/v1`) is the only thing you edit. Everything else is
computed from it**: the canvas, the per-platform previews, `HANDOFF.md`, the mockups and the
generated layout code. Layouts are structural (stacks, rows, tabs, sections), never pixel
X/Y, because an ATAK pane resizes, CloudTAK is a fixed sidebar and WinTAK docks.

Behavior is **declared, not coded**. A button points at a named action, and that action's
`intent` is a plain-English sentence ("Send a CoT with my status to the team"). Writing the
code is the agent's job.

## Run it

```bash
npm install
npm run dev        # the designer at http://localhost:5173 (try Samples → Event CAD)
npm test           # spec + validator tests
npm run typecheck
npm run build      # static site in dist/ (works from any subpath)
npm run schema     # regenerate schema/takui-v1.schema.json after editing src/spec/schema.ts
```

Requires Node 20+.

## Files

```
PLAN.md                       the plan: phases, decisions (D1–D8), open defaults
schema/takui-v1.schema.json   GENERATED JSON Schema of the spec (committed for agents; test checks drift)
src/
  spec/
    types.ts                  takui/v1 types: the canonical record (Project, Screen, Node, State, Action)
    catalog.ts                every container/element: props, bindable types, events, per-target support
    schema.ts                 zod shape schema, typed against types.ts so the two can't drift
    validate.ts               cross-reference + catalog rules, plain-language errors/warnings
    load.ts                   the only way in: JSON → migrate → shape check → validate
    jsonSchema.ts             renders schema.ts as JSON Schema (Node-only; scripts + tests)
    tree.ts                   pure tree lookups: locate, walk, list scope, resolveKey, fieldAt (key paths)
    factory.ts                new projects/nodes with valid defaults, unique ids, deep clone
  store/project.ts            THE store: every mutation, undo/redo (typing coalesced), autosave, issues
  app/                        App.vue (shell + shortcuts), TopBar, ProblemsBar (issues + spelling),
                              TemplateGallery ("New…"), ui.ts (shared panel state + tour signals)
  palette/Palette.vue         catalog as drag sources; click adds at the selection (touch-friendly)
  canvas/                     Canvas (screen tabs, platform switch, frames, scale-to-fit), CanvasNode (select/
                              drag/forgiving drops/layout), DropSlot, dnd.ts (why native DnD), view.ts (preview target)
  skins/                      SkinElement.vue (one renderer for all platforms), base.css (shared structure),
                              themes/{atak,cloudtak,wintak,webtak}.css, frames.ts, preview.ts (sample values)
  spell/                      text.ts (every user-facing string + write-back), words.ts (tokenize, TAK vocab,
                              find/replace), dictionary.ts (lazy typo-js en_US), SpellList.vue
  templates/                  6 starter projects (*.takui.json) + index.ts (gallery metadata)
  tour/                       steps.ts (14 self-checking steps + their demos), Tour.vue (card + spotlight),
                              Demo.vue (ghost-cursor "Show me" animations: drag / click / type / keys), state.ts
  emit/                       code generators (pure Project → files): common.ts (naming, escaping),
                              atak/ (layout.ts: XML + view records; java.ts: PluginState/Actions/*Views; index.ts),
                              cloudtak.ts (Vue SFC + state/actions), wintak.ts (XAML + C# 7.3 VM),
                              webtak.ts (DOM modules), takx.ts (Swing panels + @AppPlugin, Java 17),
                              index.ts (EMITTERS per target)
  ai/                         draft.ts (flat output schema, prompts built from the catalog, draft → spec repair; pure),
                              client.ts (one Messages API call, lazy-loaded), keys.ts, DraftDialog.vue
  export/                     handoff.ts (HANDOFF.md + prompts, pure), platforms.ts (per-platform agent guidance),
                              package.ts (zip contents, per-tab mockup naming), ExportDialog.vue (checks,
                              notes, starters, preview, off-screen mockup capture via html-to-image)
  inspector/                  NodeInspector (props, data, events→actions, visibility, per-platform hide),
                              ScreenInspector (screen + plugin + launch button), PropField, CommitField
  data/                       DataPanel + recursive FieldEditor (by key path), ActionsPanel, CodePanel (live
                              generated code per platform), JsonPanel
  main.ts                     Vue + Pinia bootstrap
scripts/gen-schema.ts         writes schema/takui-v1.schema.json
test/
  fixtures/hello-status.takui.json   minimal one-screen demo
  fixtures/event-cad.takui.json      richer demo shaped like IU Event CAD (tabs, lists, dialog, settings)
  spec.test.ts                each validator rule, named after the rule
  store.test.ts               store mutations: move index math, drop-into-self guard, undo, rename rewrites
  templates-spell.test.ts     every template is clean (real dictionary); spell logic; nested renames; reordering
  handoff.test.ts             HANDOFF.md covers every id/field/action; notes, starters, caveats; prompts; zip layout
  emit-atak.test.ts           every template → aapt2 compile/link → javac against android.jar (skips without SDK)
  emit-cloudtak.test.ts       every template → vue-tsc --strict --noUnusedLocals
  emit-wintak.test.ts         every {Binding} path exists; dotnet build as WPF, LangVersion 7.3 (skips off Windows)
  emit-webtak.test.ts         every template runs in jsdom: mount, render, type into inputs, click buttons
  emit-takx.test.ts           every template → javac --release 17; plugin class against stubs transcribed from the 5.8.0 Javadoc
  draft.test.ts               strict non-recursive schema; messy-draft repair validates clean; request shape via mocked fetch
  __snapshots__/              event-cad.HANDOFF.md: review the diff whenever the generator changes
  schema-file.test.ts         committed JSON Schema matches source
```

## The spec in one screen

| Part | What it holds |
|---|---|
| `meta` | name, `packageId` (reverse DNS), version, targets (≥1) |
| `state` | the plugin's data fields: `string number boolean enum datetime point contact list`. Enums carry option colors; lists carry `itemFields` |
| `actions` | `{id, label, intent, kind}`, where kind is `cot-send http map-pick navigate state-set notify custom` |
| `entry` | the launch button, mapped per platform (ATAK toolbar, CloudTAK home menu, WinTAK ribbon, WebTAK menu) |
| `screens` | `pane`, `dialog` or `settings`, each with a node tree |
| nodes | containers (`stack row grid tabs section collapsible scroll list`) and elements from [catalog.ts](src/spec/catalog.ts): 33 elements, including 9 TAK-specific ones (map point picker, MGRS field, contact picker, ...) |

Each node may have `bind` (a data field, or `$item.<field>` inside a list), `on`
(event → action), `visibleWhen` (a structured condition, not an expression language) and
`targetOverrides` (hide it or change props on one platform).

## Validation rules

**Errors** block export:
- duplicate ids
- `bind`, `on` and `visibleWhen` references that point at nothing
- a binding of the wrong type (e.g. a text box bound to a choice field)
- events the component doesn't have
- missing required props, or a prop of the wrong type (overrides included)
- a `$item` binding outside a list
- tabs without titles
- navigate actions or the entry button pointing at a missing screen
- an enum default that isn't one of its options

**Warnings** don't block export:
- an action nothing triggers
- an unknown prop
- a component a selected target can't support

## Status

| Feature | Plan § | State |
|---|---|---|
| takui/v1 spec, catalog, validator, fixtures | §4–5, Phase 0 | ✅ Working |
| Designer: palette, canvas, inspector, data + actions editors, undo, autosave, save/open | Phase 1 | ✅ Working |
| Previews: ATAK, CloudTAK, WinTAK, WebTAK, TAKX | Phase 3 (pulled forward) | ✅ Working, approximate looks |
| Spell check of all user-facing text, project dictionary | added 2026-11-10 | ✅ Working |
| Starter templates (6) + examples (2), guided tour | Phase 2 (pulled forward) | ✅ Working (tour driven end-to-end in Edge) |
| Handoff: HANDOFF.md, zip, per-tab mockups, copy-prompt, agent notes + starter repos | Phase 2 | ✅ Working (export driven end-to-end in Edge) |
| Code generators: ATAK, CloudTAK, WinTAK, WebTAK (+ Code tab, scaffold/ in the zip) | Phase 3 | ✅ Working, compiler-verified |
| Describe a screen → Claude draft (preview, insert as screen or at selection, one undo) | Phase 4 | ✅ Working (request/repair tested; live call verified to reach the API, not yet run with a real key) |
| TAKX: preview skin + Swing code generator (from the 5.8.0 SDK) | Phase 5 | ✅ Working (javac-verified against the documented API; not yet built against a real TAKX install) |
| Survey-driven components: grid, alert, stat, timer, loading; `notify` action | added 2026-11-23 ([survey](docs/PLUGIN_SURVEY.md)) | ✅ Working, compiled on all five platforms via the triage template |
| Map-item menu entries, map banners, pill groups, search box, split view | [survey](docs/PLUGIN_SURVEY.md) "Next" | ⬜ Ranked, not started |
| "Build plugin" button | Phase 5 | ⬜ Deferred by decision |

## Known gaps

- Touch screens can add (tap a palette item) and reorder (Move buttons in the inspector), but
  can't *drag* (HTML5 drag-and-drop is mouse-only).
- The platform looks are approximations from memory of each client. Verify against the real
  apps before treating any of them as a spec.
- Spell check is US English only.

## Deliberate choices

- **Export is blocked by errors, not warnings or typos.** An agent can't build from a dangling
  reference, but it can build from an approximate component (the handoff names those per platform).
- **Platform guidance is orientation, not a spec.** `export/platforms.ts` tells the agent how spec
  concepts usually map to each host and says to defer to the real SDK or starter repo. TAKX is
  explicitly marked unverified.

- **Support levels are a planning aid, not a guarantee.** `approx` means "buildable, but
  composed or styled". The levels are my best reading of each platform and haven't been
  verified against every SDK.
- **The `$item.<field>` prefix** is the only binding scope. There are no nested expressions,
  so every emitter can translate it.
- **Native HTML5 drag-and-drop, not vuedraggable.** vuedraggable mutates the arrays itself,
  which would bypass the store (and with it undo and autosave).
- **Blank text is a validation error, not a format error.** A half-finished project must still
  save and reopen, so empty names/intents are reported in Problems instead of being rejected on load.
- **Claude drafts are untrusted input.** Structured outputs can't express our recursive tree, so Claude
  returns a flat node list with parent ids. `draftToNodes` rebuilds the tree and re-makes ids unique. It
  checks every type, setting and connection against the catalog, repairs what it can, and reports the
  rest in plain words. The result goes through the normal validator.
- **The API key is the viewer's own, in their browser.** Calls go straight to api.anthropic.com (the SDK's
  `dangerouslyAllowBrowser`), so the site stays static. "Forget key" removes it. The SDK chunk loads only
  on first use.
- **Generated code is a scaffold, not a framework.** Plain platform widgets only (no AndroidX, no
  component libraries), so it drops into any template. It's regenerated from the spec, never edited
  in the builder. Behavior lives in the `Actions` stubs, whose doc comments are the designer's intents.
- **TAKX stubs are a transcript, not an invention.** The TAKX API jar only ships with a TAKX install, so
  `emit-takx.test.ts` compiles against stubs copied signature-for-signature from the SDK's Javadoc
  (`@AppPlugin`, `AAppPlugin`, `IUISpaceManager`, `ComponentDescriptorBuilder`, ...). They deliberately omit
  `canRunHeadless` (deprecated for removal), so generated code using it fails.
- **Each emitter is proven by the platform's own tool** in the test suite, not by eyeballing: aapt2 + javac,
  vue-tsc, dotnet/WPF, and a real DOM. A planted error was confirmed to fail each check.
- **Spell check never blocks.** Typos are listed separately from errors, and the project
  dictionary is saved in the project file so a team shares it. Ids, keys, option *values*
  and `noSpell` props (icon names, columns, MIME types) aren't checked.
- **Templates must be spotless.** A test loads every template with the real dictionary and
  fails on any error, warning or typo, so a new user never starts from a red screen.
- **No zod `.default()`.** Defaults belong to the loader, so input and output types stay
  identical.
