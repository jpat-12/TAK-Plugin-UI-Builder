# TAK plugin UI survey (2026-11-23)

What UI patterns do real TAK plugins use, and which ones can't the builder express yet? This
is the evidence behind the components added on 2026-11-23 and the ranked list of what's next.
Re-run it when the catalog feels short: the method is at the bottom.

## Sample

44 public GitHub repos, picked for range (mission type, platform, size), not just stars:

| Platform | Repos | Examples |
|---|---|---|
| ATAK | 26 | meshtastic/ATAK-Plugin, TDF-PL/TAKWatch, raytheonbbn/tak-cad, Cloud-RF/SOOTHSAYER, vipersq/Casualty_kit_TAK_CIV, TX-TAK/TAK-XVoice, takwerx/iwi, takwerx/sit-rep, VCWG/Air-Sea, atakmaps/TAK-MESHCORE |
| CloudTAK | 11 | clptak/incident-manager, clptak/d4h, clptak/skydio, clptak/measure, TAK-NZ/cloudtak-plugin-sar, dfndr13/replay, ValleyTactical/quick-point-dropper |
| WinTAK | 4 | Cale-Torino/WinTAK_Simple_Usage_Plugin, SWFX2324 OpenMANET, zvx-echo6/meshtastic, Moicanox/Legio-Mode |
| WebTAK | 1 | buie-byte/tak-air-track-intelligence |
| TAKX | 2 | aegorsuch/takx-plugin-physiology-dashboard (a TAK.gov mirror), BI7ACC/takx-cn-plugin |

Public WebTAK, WinTAK and TAKX plugins are rare on GitHub, so ATAK and CloudTAK carry most of
the weight. Counts below are "repos using it" out of the repos with UI source for that platform
(24 ATAK repos had layouts or UI code; 11 CloudTAK repos had .vue files).

## What they use

**ATAK, layouts (24 repos):** TextView 20, LinearLayout 20, ScrollView 18, Button 17, EditText 11,
ImageView 9, ImageButton 9, CheckBox 8, Switch 5, Spinner 4, RecyclerView 4, SeekBar 3,
HorizontalScrollView 3, TableLayout 2, ExpandableListView 2, ProgressBar 2, GridLayout 1, TabHost 1.
The builder already covered every widget used by more than one repo except grids.

**ATAK, patterns in code:**

| Pattern | Repos | Builder before this survey |
|---|---|---|
| Drop-down pane (DropDownReceiver) | 17 | ✅ pane screen |
| AlertDialog | 18 | ✅ dialog screen |
| **Toast** | 16 | ❌ no "tell the user" action → **added `notify`** |
| Places markers | 16 | ✅ cot-send action |
| Map item tap / long-press handlers | 14 | ⚠ custom action only |
| File / data package import | 13 | ✅ data-package-attach |
| **Radial menu on map items** | 11 | ❌ → next (below) |
| Settings screen | 10 | ✅ settings screen |
| Range & bearing math | 10 | n/a (logic) |
| List adapters | 10 | ✅ list / table |
| Draw shapes on the map | 8 | ❌ → next |
| Map overlay widgets / HUD text | 7 | ❌ → next |
| Search box | 7 | ⚠ text box |
| Signature / drawing pad | 4 | ❌ → later |
| Status-bar notifications | 4 | ❌ → **`notify` style=notification** |
| Timers / countdowns | 3 | ❌ → **added `timer`** |
| Custom Canvas views (body diagram, waveforms) | 3 | ❌ niche |

**CloudTAK, components (11 repos):** TablerLoading 6 repos, TablerInput 5, TablerIconButton 5,
**TablerInlineAlert 4 (40 uses)**, TablerModal 4, TablerNone 4, TablerBorder 3, TablerEnum 3,
TablerToggle 3, **TablerPillGroup 3**, FloatingPane 3, SlideDownHeader 2. So inline alerts, loading
states and pill (segmented) pickers are everyday CloudTAK vocabulary.

**WinTAK, XAML (4 repos):** TextBlock, StackPanel, Grid, Button, GroupBox, CheckBox, TextBox,
ItemsControl, ListBox, ComboBox, TabItem, ProgressBar, UniformGrid, and Ellipse (status dots).
OpenMANET's pane is a dashboard: stat counts (nodes online, bandwidth), a node list, an event log
and a health dot on the toolbar icon.

**TAKX:** the physiology dashboard mounts its panel exactly the way our TAKX emitter does
(`@AppPlugin` → `AAppPlugin`, `ComponentDescriptorBuilder(...).setComponentPosition(RIGHT)`,
`addComponent`, `@InvokeOnEDT` on start/stop), which is the first check of that emitter against a
real plugin rather than the Javadoc. Its UI is a JTable list over a JSplitPane detail view.

## Patterns that recur across platforms

Read from READMEs and screens of the richest plugins:

- **Live clocks.** Tourniquet time on every casualty card (Casualty Kit), duty and elapsed clocks,
  refresh intervals.
- **Dashboards of counts.** OpenMANET (nodes, throughput), triage counts, physiology vitals.
- **Inline warnings and disclaimers.** TAK-NZ SAR shows "Warning:" and "Note:" lines and the
  engine's disclaimer word for word; Skydio and D4H show sync and auth problems in the pane.
- **Preset grids and big buttons.** TAK-NZ SAR's 2×2 speed presets; XVoice's oversized
  push-to-talk and emergency buttons.
- **Mode pickers as pill groups.** TAK-NZ SAR's "Travel Time / TARR" pills; SOOTHSAYER's mode
  slider.
- **Tap a map item to act on it.** Radial-menu entries (11 ATAK repos), and "click a node's
  marker to open it in the pane" (OpenMANET).
- **Map banners while a map tool runs.** "Tap the map to set the start point" with Cancel
  (TAK-NZ SAR, replay plugin).
- **Master/detail.** A list with a detail area (TAKX physiology split pane, Incident Manager's
  left nav plus tabs).

## What was added (2026-11-23)

| Addition | Why | Platforms |
|---|---|---|
| **Grid** container (1–6 equal columns) | preset grids, big-button field UIs, stat dashboards | ATAK rows of weighted LinearLayouts · CloudTAK/WebTAK CSS grid · WinTAK UniformGrid · TAKX GridLayout |
| **Alert banner** (info/success/warning/danger, bindable) | inline warnings and sync errors; CloudTAK's most-used non-input component | all five |
| **Stat tile** (big value + caption + unit) | dashboards | all five |
| **Timer** (elapsed/countdown from a date-time field, red past a warning point) | tourniquet and duty clocks | all five, each with one shared 1-second clock per screen |
| **Loading** (spinner + text) | busy states; pair with "Show only when" | all five |
| **notify** action (toast / notification / alert box) | the most common ATAK UI call after layouts | handoff guidance per platform |
| **Mass Casualty Triage** template | exercises all of the above; compiled on all five platforms by the test suite | — |

## Next, ranked by evidence

1. **Map-item menu entries** (11 ATAK repos + OpenMANET): "when a marker of type X is tapped,
   offer these actions". Needs a new entry point in the spec (beside the launch button) and per
   platform wiring: ATAK radial menu, WinTAK context menu, CloudTAK feature menu.
2. **Map banner / HUD text** (7 ATAK repos + 2 CloudTAK): a small overlay on the map while a tool
   runs, or a live readout (the geocoder plugin's address next to the coordinate panel). Likely a
   new screen kind, `overlay`.
3. **Pill group** look for radio buttons (CloudTAK 3 repos, SAR mode picker): a `look: pills`
   prop on radio-group.
4. **Search box** (7 ATAK repos): a text box with a search look that filters a named list.
5. **Master/detail split** (TAKX physiology, Incident Manager): a split container.
6. **Draw on the map** (8 ATAK repos): shape-drawing actions (circle, polygon, range rings). These
   are actions more than UI; a `map-draw` action kind with a shape parameter.
7. **Signature pad** (4 repos), **body diagram** (Casualty Kit): niche; a tappable image with
   hotspots would cover both later.

Not worth building yet: charts (0 of 44 repos), video players (1), WebView UIs (1, the
React-in-ATAK experiment).

## Method (to re-run)

1. GitHub search API: `atak plugin`, `topic:atak-plugin`, `wintak plugin`, `cloudtak plugin`,
   `webtak plugin`, `takx plugin`, sorted by stars; pick ~40 across mission types.
2. `git clone --depth 1 --filter=blob:limit=300k` each into a scratch folder. Read only; never
   build or run cloned code.
3. Tally tags in `res/layout/*.xml`, `*.vue` templates and `*.xaml`; grep Java/Kotlin for the
   pattern table's API names; read READMEs for described screens.
4. Compare against `src/spec/catalog.ts` and `ACTION_KINDS`; rank gaps by repos-using-it.
