// API key storage, kept apart from client.ts so the UI can read/forget the key without
// loading the Anthropic SDK (which is lazy-loaded on first draft to keep the main bundle small).

const KEY_STORAGE = 'takui:anthropic-key';
export const MODEL = 'claude-opus-5-5';

export function loadKey(): string {
  try { return localStorage.getItem(KEY_STORAGE) ?? ''; } catch { return ''; /* storage blocked: ask each time */ }
}
export function saveKey(key: string | null): void {
  try { if (key) localStorage.setItem(KEY_STORAGE, key); else localStorage.removeItem(KEY_STORAGE); } catch { /* storage blocked: key lives only for this session */ }
}
