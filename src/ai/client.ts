// Phase 4 network half: one Messages API call from the browser with the user's own key
// (PLAN.md §12 default 2: key entered in the browser, kept in localStorage, sent only to
// api.anthropic.com; no proxy, so the site stays static).
//
// dangerouslyAllowBrowser is deliberate: the key is the VIEWER's own, typed into their own
// browser, never bundled into the build. Anyone who can run JS on this origin could read it,
// which is why the UI says so and offers "forget key".

import Anthropic from '@anthropic-ai/sdk';
import type { Project } from '../spec/types';
import { DRAFT_JSON_SCHEMA, SYSTEM_PROMPT, parseDraft, userMessage, type Draft } from './draft';

import { MODEL } from './keys';

export { MODEL };

export class DraftError extends Error {
  override name = 'DraftError'; // the dialog checks the name: it doesn't import this module eagerly
}

/**
 * Ask Claude to draft a screen. Throws DraftError with a message fit to show the user.
 * `fetch` is injectable so tests can check the request without spending tokens.
 */
export async function requestDraft(apiKey: string, description: string, p: Project, opts: { signal?: AbortSignal; fetch?: typeof fetch } = {}): Promise<Draft> {
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 2, ...(opts.fetch ? { fetch: opts.fetch } : {}) });
  let response: Anthropic.Beta.BetaMessage;
  try {
    response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      // server-side refusal fallback: if a safeguard declines, the API retries on a suitable model in the same call
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: {
        effort: 'medium', // a screen draft is routine work; Opus 5.5's default, stated so a future default change doesn't silently move cost
        format: { type: 'json_schema', schema: DRAFT_JSON_SCHEMA },
      },
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage(description, p) }],
    }, { signal: opts.signal });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) throw new DraftError('That API key was rejected. Check it at console.anthropic.com → API keys.');
    if (e instanceof Anthropic.PermissionDeniedError) throw new DraftError("That API key doesn't have access to this model.");
    if (e instanceof Anthropic.RateLimitError) throw new DraftError('Rate limited by the API. Wait a minute and try again.');
    if (e instanceof Anthropic.BadRequestError) throw new DraftError(`The API rejected the request: ${e.message}`);
    if (e instanceof Anthropic.APIUserAbortError) throw new DraftError('Cancelled.');
    if (e instanceof Anthropic.APIConnectionError) throw new DraftError("Couldn't reach the API. Check your connection (and that nothing blocks api.anthropic.com).");
    if (e instanceof Anthropic.APIError) throw new DraftError(`API error ${e.status ?? ''}: ${e.message}`);
    throw e;
  }
  if (response.stop_reason === 'refusal') throw new DraftError("Claude declined to draft this screen. Try rewording the description.");
  if (response.stop_reason === 'max_tokens') throw new DraftError('The draft was too long and got cut off. Try describing a smaller screen.');
  const text = response.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
  try {
    return parseDraft(text);
  } catch (e) {
    throw new DraftError((e as Error).message);
  }
}
