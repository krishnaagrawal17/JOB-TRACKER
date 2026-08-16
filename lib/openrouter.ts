export interface OpenRouterMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface CallOpenRouterParams {
  model: string;
  messages: OpenRouterMessage[];
  plugins?: { id: string; max_results?: number }[];
  responseFormat?: { type: 'json_object' };
}

/** Generous by design: web-grounded briefs are the slowest of the four kit calls and
 * a normal one can take well over a minute. This exists so a *hung* request can't
 * pin KitPanel's "Generating..." state open forever — not to cap a slow-but-live one. */
const OPENROUTER_TIMEOUT_MS = 120_000;

export async function callOpenRouter(params: CallOpenRouterParams): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY is not set');
  }

  const body: Record<string, unknown> = {
    model: params.model,
    messages: params.messages,
  };
  if (params.plugins) {
    body.plugins = params.plugins;
  }
  if (params.responseFormat) {
    body.response_format = params.responseFormat;
  }

  const controller = new AbortController();
  let timedOut = false;
  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, OPENROUTER_TIMEOUT_MS);

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    // Cleared as soon as headers land so a slow body read can't be misreported as a
    // timeout, and so a late timer can't overwrite a genuine error message below.
    clearTimeout(timeoutId);

    if (!response.ok) {
      const errBody = await response.json().catch(() => null);
      const message = errBody?.error?.message ?? `OpenRouter request failed (${response.status})`;
      throw new Error(message);
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('OpenRouter returned an empty response');
    }

    // NOTE (v1 scope): OpenRouter's web plugin also returns citation annotations on the
    // message, and this string-only return deliberately discards them. That is why
    // company_brief_sources is always null in practice — capturing citations is deferred
    // feature work, not a bug in the brief's parsing or in CompanyBriefSection's UI.
    return content;
  } catch (err) {
    if (timedOut) {
      throw new Error(`OpenRouter did not respond within ${OPENROUTER_TIMEOUT_MS / 1000} seconds.`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}
