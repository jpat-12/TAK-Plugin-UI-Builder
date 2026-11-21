// Builder UI state shared across panels (not part of the project). Lives outside the store
// because it never changes the design and never belongs in undo history.

import { ref } from 'vue';

export type LeftTab = 'add' | 'data' | 'actions' | 'code' | 'json';
export const leftTab = ref<LeftTab>('add');

/** Template gallery modal (TopBar "New…", tour start) */
export const galleryOpen = ref(false);

/** "Describe a screen" (Claude draft) dialog */
export const draftOpen = ref(false);

/** One-shot signals the guided tour waits on (events that leave no trace in the project) */
export const signals = ref({ saved: false });
