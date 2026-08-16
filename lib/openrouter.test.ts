import { callOpenRouter } from './openrouter';

const originalFetch = global.fetch;
const originalEnv = process.env.OPENROUTER_API_KEY;

afterEach(() => {
  global.fetch = originalFetch;
  process.env.OPENROUTER_API_KEY = originalEnv;
  vi.restoreAllMocks();
});

describe('callOpenRouter', () => {
  it('throws if OPENROUTER_API_KEY is not set', async () => {
    delete process.env.OPENROUTER_API_KEY;
    await expect(
      callOpenRouter({ model: 'test/model', messages: [{ role: 'user', content: 'hi' }] })
    ).rejects.toThrow('OPENROUTER_API_KEY is not set');
  });

  it('sends the correct request shape and returns the content', async () => {
    process.env.OPENROUTER_API_KEY = 'test-key';
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'Generated text' } }] }),
    });
    global.fetch = mockFetch as unknown as typeof fetch;

    const result = await callOpenRouter({
      model: 'test/model',
      messages: [
        { role: 'system', content: 'You are helpful.' },
        { role: 'user', content: 'Write a cover letter.' },
      ],
    });

    expect(result).toBe('Generated text');
    expect(mockFetch).toHaveBeenCalledWith(
      'https://openrouter.ai/api/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-key',
          'Content-Type': 'application/json',
        }),
      })
    );
    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body.model).toBe('test/model');
    expect(body.messages).toEqual([
      { role: 'system', content: 'You are helpful.' },
      { role: 'user', content: 'Write a cover letter.' },
    ]);
    expect(body.plugins).toBeUndefined();
    expect(body.response_format).toBeUndefined();
  });

  it('includes plugins in the request body when provided', async () => {
    process.env.OPENROUTER_API_KEY = 'test-key';
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'Brief text' } }] }),
    });
    global.fetch = mockFetch as unknown as typeof fetch;

    await callOpenRouter({
      model: 'test/web-model',
      messages: [{ role: 'user', content: 'Research this company.' }],
      plugins: [{ id: 'web', max_results: 5 }],
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body.plugins).toEqual([{ id: 'web', max_results: 5 }]);
  });

  it('includes response_format in the request body when provided', async () => {
    process.env.OPENROUTER_API_KEY = 'test-key';
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '{"title":"Engineer"}' } }] }),
    });
    global.fetch = mockFetch as unknown as typeof fetch;

    await callOpenRouter({
      model: 'test/model',
      messages: [{ role: 'user', content: 'Extract fields as JSON.' }],
      responseFormat: { type: 'json_object' },
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body.response_format).toEqual({ type: 'json_object' });
  });

  it('throws with the OpenRouter error message when the HTTP call fails', async () => {
    process.env.OPENROUTER_API_KEY = 'test-key';
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({ error: { message: 'rate limited' } }),
    }) as unknown as typeof fetch;

    await expect(
      callOpenRouter({ model: 'test/model', messages: [{ role: 'user', content: 'hi' }] })
    ).rejects.toThrow('rate limited');
  });

  it('passes an abort signal so a hung request cannot hang forever', async () => {
    process.env.OPENROUTER_API_KEY = 'test-key';
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'Generated text' } }] }),
    });
    global.fetch = mockFetch as unknown as typeof fetch;

    await callOpenRouter({ model: 'test/model', messages: [{ role: 'user', content: 'hi' }] });

    expect(mockFetch.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });

  it('aborts the request and reports a readable timeout when OpenRouter never responds', async () => {
    vi.useFakeTimers();
    try {
      process.env.OPENROUTER_API_KEY = 'test-key';
      let abortedSignal: AbortSignal | undefined;
      global.fetch = vi.fn().mockImplementation(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener('abort', () => {
              abortedSignal = init.signal as AbortSignal;
              reject(new DOMException('The operation was aborted.', 'AbortError'));
            });
          })
      ) as unknown as typeof fetch;

      const promise = callOpenRouter({ model: 'test/model', messages: [{ role: 'user', content: 'hi' }] });
      const rejection = expect(promise).rejects.toThrow('OpenRouter did not respond within 120 seconds.');

      await vi.advanceTimersByTimeAsync(120_000);
      await rejection;

      expect(abortedSignal?.aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('throws if the response has no content', async () => {
    process.env.OPENROUTER_API_KEY = 'test-key';
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [] }),
    }) as unknown as typeof fetch;

    await expect(
      callOpenRouter({ model: 'test/model', messages: [{ role: 'user', content: 'hi' }] })
    ).rejects.toThrow('empty response');
  });
});
