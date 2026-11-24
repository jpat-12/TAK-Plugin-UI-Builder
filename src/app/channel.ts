// Which copy of the site this is. The dev preview (built with VITE_CHANNEL=dev, served at
// <live url>/dev/) shares the live site's browser storage, because both are on the same
// origin. So the dev copy autosaves under its own key: trying a dev feature (a field the
// live version doesn't know yet) can never break someone's live autosave.

export const CHANNEL: 'live' | 'dev' = import.meta.env.VITE_CHANNEL === 'dev' ? 'dev' : 'live';

/** Autosave key per channel. Live keeps the original key, so existing autosaves are untouched. */
export const storageKeyFor = (channel: 'live' | 'dev') => (channel === 'dev' ? 'takui-dev:v1' : 'takui:v1');
