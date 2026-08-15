/**
 * Default OpenRouter model slugs. No model-picker UI in v1 — these are the
 * only two models the app ever calls.
 *
 * PLACEHOLDER SLUGS: verify both of these against OpenRouter's live
 * `/api/v1/models` list before relying on real generations (and confirm the
 * `:online` web-search plugin — `plugins: [{ id: 'web', max_results: 5 }]` —
 * actually works against WEB_MODEL_SLUG). sketch2app's MEMORY.md documents
 * catching a wrong Gemini slug exactly this way; do the same check here
 * before Task 21's manual walkthrough.
 */
export const TEXT_MODEL_SLUG = 'anthropic/claude-sonnet-5';

/** Used only for the company-brief call, with the `web` plugin attached. */
export const WEB_MODEL_SLUG = 'anthropic/claude-sonnet-5';
