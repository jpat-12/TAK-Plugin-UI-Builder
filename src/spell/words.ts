// Pure spell-check logic: split text into checkable words and find the misspelled ones.
// The dictionary is injected (isCorrect) so this runs the same in the browser and in tests.

import type { TextSpot } from './text';

/**
 * TAK / public-safety vocabulary the stock en_US dictionary doesn't know. Lowercase.
 * Add here when a common field term trips the checker; project-specific words go in the
 * project dictionary (meta.spellingAllow) instead.
 */
export const TAK_WORDS = new Set([
  'atak', 'wintak', 'webtak', 'cloudtak', 'takx', 'tak', 'cot', 'pli', 'mgrs', 'utm', 'hae', 'uid', 'uids',
  'callsign', 'callsigns', 'geochat', 'geofence', 'geofences', 'iconset', 'iconsets', 'datapackage', 'datapackages',
  'plugin', 'plugins', 'toolbar', 'dropdown', 'dropdowns', 'checkbox', 'checkboxes', 'toast', 'toasts',
  'arcgis', 'caltopo', 'wmirs', 'what3words', 'latlon', 'lat', 'lon', 'gps', 'sitrep', 'sitreps',
  'medevac', 'triage', 'sortie', 'sorties', 'checkin', 'checkins', 'roster', 'rosters', 'waypoint', 'waypoints',
  'multicast', 'unicast', 'ems', 'eoc', 'ics', 'sar', 'uas', 'ptt', 'oos', 'eta', 'etas', 'par', 'url', 'urls', 'api',
  'mins', 'hrs', 'wx', 'login', 'logout', 'username', 'app', 'apps', 'ok', 'json', 'csv', 'kml', 'kmz', 'gpx',
]);

export interface Token { word: string; start: number }

/**
 * Words worth checking. Skips: URLs, `$item.x`/`#id` refs, anything with digits or _,
 * ALL-CAPS acronyms (MGRS, P1), and mixedCase identifiers (GeoChat, myStatus).
 */
export function tokenize(text: string): Token[] {
  const masked = text
    .replace(/https?:\/\/\S+/g, (m) => ' '.repeat(m.length))
    .replace(/[$#@][\w.-]+/g, (m) => ' '.repeat(m.length));
  const out: Token[] = [];
  for (const m of masked.matchAll(/[A-Za-z0-9_'’]+/g)) {
    let word = m[0].replace(/^['’]+|['’]+$/g, '');
    const start = m.index! + m[0].indexOf(word);
    word = word.replace(/['’]s$/i, ''); // possessive: "team's" → "team"
    if (word.length < 2) continue;
    if (/[\d_]/.test(word)) continue;
    if (word === word.toUpperCase()) continue;
    if (/[a-z][A-Z]/.test(word)) continue;
    out.push({ word, start });
  }
  return out;
}

export interface Misspelling {
  spot: TextSpot;
  word: string;
  start: number;
}

export function findMisspellings(spots: TextSpot[], isCorrect: (w: string) => boolean, allow: Iterable<string> = []): Misspelling[] {
  const allowed = new Set([...TAK_WORDS, ...[...allow].map((w) => w.toLowerCase())]);
  const out: Misspelling[] = [];
  for (const spot of spots) {
    for (const t of tokenize(spot.text)) {
      if (allowed.has(t.word.toLowerCase())) continue;
      if (!isCorrect(t.word)) out.push({ spot, word: t.word, start: t.start });
    }
  }
  return out;
}

/** Replace the word at `start` with `next`, keeping a leading capital if the original had one */
export function replaceWord(text: string, start: number, word: string, next: string): string {
  if (text.slice(start, start + word.length) !== word) return text; // text changed since the check
  const fixed = /^[A-Z]/.test(word) ? next[0]!.toUpperCase() + next.slice(1) : next;
  return text.slice(0, start) + fixed + text.slice(start + word.length);
}
