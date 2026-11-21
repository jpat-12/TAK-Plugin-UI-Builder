// Browser-side dictionary: typo-js + its bundled en_US Hunspell files, fetched lazily so the
// ~700 KB dictionary doesn't delay first paint. Vite's ?url copies the files into the build,
// so it works offline from the static site (PLAN.md D6), with no CDN.

import { shallowRef } from 'vue';
import Typo from 'typo-js';
import affUrl from 'typo-js/dictionaries/en_US/en_US.aff?url';
import dicUrl from 'typo-js/dictionaries/en_US/en_US.dic?url';

export const dictionary = shallowRef<Typo | null>(null);
let started = false;

export function loadDictionary(): void {
  if (started) return;
  started = true;
  Promise.all([fetch(affUrl).then((r) => r.text()), fetch(dicUrl).then((r) => r.text())])
    .then(([aff, dic]) => { dictionary.value = new Typo('en_US', aff, dic); })
    .catch((e) => { started = false; console.warn('[takui] spell-check dictionary failed to load', e); });
}

const suggestCache = new Map<string, string[]>();
/** typo-js suggest() is slow (~50–200 ms); cache per word */
export function suggestions(word: string): string[] {
  const d = dictionary.value;
  if (!d) return [];
  if (!suggestCache.has(word)) suggestCache.set(word, d.suggest(word, 4));
  return suggestCache.get(word)!;
}
