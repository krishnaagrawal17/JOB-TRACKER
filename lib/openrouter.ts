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

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

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

  return content;
}
