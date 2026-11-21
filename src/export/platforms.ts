// Per-platform build guidance written into HANDOFF.md. This is ORIENTATION for the coding
// agent, not a spec: each block says how the spec's concepts usually map onto that host, and
// tells the agent to defer to the real SDK / starter repo where they disagree. Where a detail
// is unverified it says so; don't harden guesses into instructions.

import type { Target } from '../spec/types';

export interface PlatformGuide {
  name: string;
  stack: string;
  /** How each spec concept maps to the host. Keys match the bullet labels in HANDOFF.md. */
  mapping: { concept: string; how: string }[];
  rules: string[];
}

export const PLATFORM_GUIDES: Record<Target, PlatformGuide> = {
  atak: {
    name: 'ATAK (Android)',
    stack: 'ATAK-CIV plugin in Java or Kotlin, built against the ATAK plugin SDK from tak.gov (match the SDK version to the target ATAK version).',
    mapping: [
      { concept: 'pane screen', how: 'A DropDownReceiver showing an inflated res/layout XML, opened at half or full width. Follow the SDK\'s plugin template for registration.' },
      { concept: 'dialog screen', how: 'An Android AlertDialog (or a DialogFragment) with its own layout XML.' },
      { concept: 'settings screen', how: 'A PreferenceScreen XML registered in ATAK\'s settings for this plugin; persisted fields become preferences.' },
      { concept: 'launch button', how: 'The plugin\'s toolbar tool (icon + label from the spec\'s entry).' },
      { concept: 'layout blocks', how: 'stack → vertical LinearLayout, row → horizontal LinearLayout, scroll → ScrollView, tabs → TabHost/TabLayout, list → ListView/RecyclerView with one row layout.' },
      { concept: 'persisted fields', how: 'SharedPreferences, keyed with the plugin package id as a prefix.' },
      { concept: 'cot-send actions', how: 'Build a CotEvent and dispatch it through ATAK\'s CoT dispatcher (internal or external as the intent requires).' },
      { concept: 'map-pick actions', how: 'A map click listener / point-picking tool that returns a GeoPoint, then closes itself.' },
    ],
    rules: [
      'Use the spec\'s node ids (camelCased) as Android view ids so the layout can be traced back to the design.',
      'Do the network and file work off the UI thread. Report failures to the user with a Toast and log stack traces with Log.e.',
      'Never commit local.properties, keystores or API keys.',
    ],
  },
  cloudtak: {
    name: 'CloudTAK (web)',
    stack: 'CloudTAK web plugin: Vue 3 single-file components with a class-based plugin entry (install / enable / disable), compiled inside CloudTAK.',
    mapping: [
      { concept: 'pane screen', how: 'A route-mounted Vue panel component with Tabler styling.' },
      { concept: 'launch button', how: 'A home-menu entry (icon + label).' },
      { concept: 'settings screen', how: 'A settings panel/route for the plugin.' },
      { concept: 'persisted fields', how: 'Plugin-namespaced storage. If the plugin has a server side, store there and keep localStorage as the offline fallback only.' },
      { concept: 'cot-send actions', how: 'CloudTAK\'s map/worker CoT APIs. Use the documented plugin APIs before any internal reach-ins.' },
    ],
    rules: [
      'Register routes in install(), never in enable()/disable().',
      'Wrap every component/icon passed to CloudTAK in markRaw().',
      'Namespace all keys and route names (plugin-<name>, home-menu-<name>).',
      'Must pass vue-tsc --noEmit and eslint: CloudTAK\'s build fails otherwise.',
      'Never edit CloudTAK core files.',
    ],
  },
  wintak: {
    name: 'WinTAK (Windows)',
    stack: 'WinTAK plugin in C#/.NET with WPF views, built against the WinTAK SDK for the target WinTAK version.',
    mapping: [
      { concept: 'pane screen', how: 'A WPF UserControl (XAML) hosted in a WinTAK dock pane.' },
      { concept: 'dialog screen', how: 'A WPF Window shown as a dialog.' },
      { concept: 'launch button', how: 'A ribbon button that shows the dock pane.' },
      { concept: 'layout blocks', how: 'stack → StackPanel, row → StackPanel Orientation=Horizontal (or Grid), scroll → ScrollViewer, tabs → TabControl, list → ItemsControl/ListView with a DataTemplate.' },
      { concept: 'data fields', how: 'A view model with INotifyPropertyChanged; bind controls to it in XAML.' },
    ],
    rules: [
      'Follow the SDK\'s plugin template for how the plugin is discovered and how the dock pane and ribbon are registered.',
      'Keep network work async, and marshal UI updates to the dispatcher thread.',
    ],
  },
  webtak: {
    name: 'WebTAK (browser)',
    stack: 'WebTAK plugin: plain JavaScript loaded by WebTAK as a single classic <script>, so author ES modules but bundle to one IIFE with no import/export at runtime.',
    mapping: [
      { concept: 'pane screen', how: 'A floating DOM panel over the WebTAK map, with styles injected by the plugin.' },
      { concept: 'launch button', how: 'A WebTAK menu entry that toggles the panel.' },
      { concept: 'persisted fields', how: 'localStorage, namespaced with the plugin package id.' },
      { concept: 'http / server calls', how: 'WebTAK\'s page origin is an authenticated TAK Server session, so same-origin Marti API calls need no extra login.' },
    ],
    rules: [
      'No framework is assumed. Keep the bundle small and dependency-free unless the notes say otherwise.',
      'Prefix every DOM id, class and storage key with the plugin name to avoid collisions with WebTAK.',
    ],
  },
  takx: {
    name: 'TAKX (desktop)',
    stack: 'TAKX app plugin: Java 17 + Swing, built against the TAKX Platform API (gov.takx:platform) from a TAKX install. Verified against the TAKX 5.8.0 SDK; its curriculum\'s RavenAppPlugin is the reference.',
    mapping: [
      { concept: 'plugin class', how: '@AppPlugin(spec = @PluginSpecification(family, type, version, iconPath), descriptor = @PluginDescriptor(name, ...)) on a class extending AAppPlugin; build UI in start(), remove it in stop(). Don\'t use canRunHeadless (deprecated for removal).' },
      { concept: 'pane screen', how: 'A JPanel mounted with delegate.getUISpaceManager().addComponent(new ComponentDescriptorBuilder(panel, title).setComponentPosition(ComponentPosition.RIGHT).build(), panel), then showComponent(panel).' },
      { concept: 'launch button', how: 'The panel\'s ComponentDescriptor: setToolbarButtonVisible(true) + setTooltipText(label) + setIcon(...).' },
      { concept: 'dialog screen', how: 'A JPanel shown in a JOptionPane / JDialog.' },
      { concept: 'layout blocks', how: 'stack/row → BoxLayout, section → titled border, tabs → JTabbedPane, scroll → JScrollPane, list → rows rebuilt from the data, table → JTable.' },
      { concept: 'threading', how: 'Touch Swing only on the Event Dispatch Thread: mark UI methods @InvokeOnEDT (as the SDK example does) or use SwingUtilities.invokeLater.' },
      { concept: 'globe', how: 'delegate.getGlobeManager().getLastFocusedGlobe().goTo(location) to show a location (see the SDK\'s RavenAppPanel).' },
    ],
    rules: [
      'Only use the TAKX Platform API (gov.takx.api / gov.takx.platform). Client internals are not plugin API.',
      'Build with the SDK project\'s build.gradle (takxInstallDir, takxVersion, takKernelVersion, worldwindVersion must match the install).',
    ],
  },
};
