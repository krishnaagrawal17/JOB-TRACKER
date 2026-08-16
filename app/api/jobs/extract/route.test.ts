import { NextRequest } from 'next/server';

vi.mock('@/lib/fetchJob', () => ({
  fetchAndExtractText: vi.fn(),
  FetchBlockedError: class FetchBlockedError extends Error {},
}));
vi.mock('@/lib/openrouter', () => ({
  callOpenRouter: vi.fn(),
}));

import { fetchAndExtractText, FetchBlockedError } from '@/lib/fetchJob';
import { callOpenRouter } from '@/lib/openrouter';
import { POST } from './route';

function makeRequest(body: unknown) {
  return new NextRequest('http://localhost/api/jobs/extract', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

afterEach(() => {
  vi.resetAllMocks();
});

describe('POST /api/jobs/extract', () => {
  it('returns 400 when neither url nor text is provided', async () => {
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBeTruthy();
  });

  it('extracts from pasted text without calling fetchAndExtractText', async () => {
    vi.mocked(callOpenRouter).mockResolvedValue(
      JSON.stringify({
        title: 'Engineer',
        company: 'Acme',
        location: 'Remote',
        salary: null,
        description: 'Do stuff.',
        sourceUrl: null,
        extraFields: {},
      })
    );

    const res = await POST(makeRequest({ text: 'Engineer role at Acme, remote, do stuff.' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.extracted.title).toBe('Engineer');
    expect(json.rawText).toBe('Engineer role at Acme, remote, do stuff.');
    expect(fetchAndExtractText).not.toHaveBeenCalled();
  });

  it('fetches and extracts from a url', async () => {
    vi.mocked(fetchAndExtractText).mockResolvedValue('Fetched job posting text.');
    vi.mocked(callOpenRouter).mockResolvedValue(
      JSON.stringify({
        title: 'Engineer',
        company: 'Acme',
        location: null,
        salary: null,
        description: null,
        sourceUrl: null,
        extraFields: {},
      })
    );

    const res = await POST(makeRequest({ url: 'https://acme.example/jobs/1' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.rawText).toBe('Fetched job posting text.');
    expect(fetchAndExtractText).toHaveBeenCalledWith('https://acme.example/jobs/1');
  });

  it('returns 422 with blocked: true when the url fetch is blocked', async () => {
    vi.mocked(fetchAndExtractText).mockRejectedValue(new FetchBlockedError('blocked'));

    const res = await POST(makeRequest({ url: 'https://linkedin.example/jobs/1' }));
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.blocked).toBe(true);
  });

  it('accepts a valid payload wrapped in a ```json code fence', async () => {
    vi.mocked(callOpenRouter).mockResolvedValue(
      '```json\n' +
        JSON.stringify({
          title: 'Engineer',
          company: 'Acme',
          location: 'Remote',
          salary: null,
          description: 'Do stuff.',
          sourceUrl: null,
          extraFields: {},
        }) +
        '\n```'
    );

    const res = await POST(makeRequest({ text: 'Engineer role at Acme.' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.extracted.title).toBe('Engineer');
    expect(json.extracted.company).toBe('Acme');
  });

  it('accepts a valid payload wrapped in a bare ``` fence', async () => {
    vi.mocked(callOpenRouter).mockResolvedValue(
      '```\n' +
        JSON.stringify({
          title: 'Designer',
          company: 'Acme',
          location: null,
          salary: null,
          description: null,
          sourceUrl: null,
          extraFields: {},
        }) +
        '\n```'
    );

    const res = await POST(makeRequest({ text: 'Designer role at Acme.' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.extracted.title).toBe('Designer');
  });

  it('returns 502 with a readable message (not a raw parse error) when the response is unparseable', async () => {
    vi.mocked(callOpenRouter).mockResolvedValue('Sorry, I cannot help with that.');

    const res = await POST(makeRequest({ text: 'Some job text' }));
    expect(res.status).toBe(502);
    const json = await res.json();
    expect(json.error).toBe('Extraction returned an unreadable response. Try again.');
    expect(json.error).not.toMatch(/Unexpected token|JSON at position/);
  });

  it('returns 502 when the model response fails schema validation', async () => {
    vi.mocked(callOpenRouter).mockResolvedValue(JSON.stringify({ title: 12345 }));

    const res = await POST(makeRequest({ text: 'Some job text' }));
    expect(res.status).toBe(502);
  });

  it('returns 500 with the error message when callOpenRouter throws', async () => {
    vi.mocked(callOpenRouter).mockRejectedValue(new Error('rate limited'));

    const res = await POST(makeRequest({ text: 'Some job text' }));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('rate limited');
  });
});
