/**
 * Default OpenRouter model slugs. No model-picker UI in v1 — these are the
 * only two models the app ever calls. Both being identical is deliberate, not a
 * copy-paste slip: they are separate names so the web-grounded call can move to a
 * different model without touching the other three.
 *
 * Verified live against OpenRouter on 2026-08-16 with real requests, not just a
 * `/api/v1/models` lookup: the slug resolves, `response_format: { type:
 * 'json_object' }` returns bare parseable JSON, and `plugins: [{ id: 'web',
 * max_results: 5 }]` returns grounded content with `url_citation` annotations.
 * Re-verify the same way if these ever change — sketch2app shipped a wrong slug
 * by trusting the string alone.
 */
export const TEXT_MODEL_SLUG = 'openai/gpt-5.6-luna';

/** Used only for the company-brief call, with the `web` plugin attached. */
export const WEB_MODEL_SLUG = 'openai/gpt-5.6-luna';
