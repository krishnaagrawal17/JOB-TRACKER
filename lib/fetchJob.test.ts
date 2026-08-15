import { fetchAndExtractText, FetchBlockedError } from './fetchJob';

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

const ARTICLE_HTML = `
<!DOCTYPE html>
<html>
  <head><title>Senior Backend Engineer at Acme</title></head>
  <body>
    <article>
      <h1>Senior Backend Engineer</h1>
      <p>Acme Corp is looking for a Senior Backend Engineer to join our payments platform team. You will own critical services that process millions of transactions per day, mentor junior engineers, and collaborate closely with product and design.</p>
      <p>We are looking for someone with at least 5 years of experience building distributed backend systems, strong communication skills, and a track record of shipping reliable software at scale. Experience with Go or TypeScript is a strong plus.</p>
      <p>This is a fully remote position with a salary range of $160,000 to $190,000 depending on experience, plus equity and full benefits.</p>
    </article>
  </body>
</html>
`;

const TABLE_LAYOUT_HTML = `
<!DOCTYPE html>
<html>
  <head><title>Job Posting</title></head>
  <body>
    <table>
      <tr><td>Title</td><td>Senior Backend Engineer</td></tr>
      <tr><td>Company</td><td>Acme Corp</td></tr>
      <tr><td>Location</td><td>Remote</td></tr>
      <tr><td>Salary</td><td>$160,000 - $190,000</td></tr>
      <tr><td>Description</td><td>Acme Corp is looking for a Senior Backend Engineer to join our payments platform team. You will own critical services that process millions of transactions per day, mentor junior engineers, and collaborate closely with product and design. We expect at least five years of relevant experience and strong communication skills.</td></tr>
    </table>
  </body>
</html>
`;

// Readability strips this entirely (empirically verified: `<footer>` combined with a
// class matching its unlikely-candidate regex — "sidebar" — causes `reader.parse()` to
// return null), while html-to-text has no article-detection heuristics and converts the
// raw markup regardless of the wrapping tag, producing genuinely usable output. This is
// the fixture that actually exercises `extractWithHtmlToText`'s success path.
const SIDEBAR_WIDGET_HTML = `
<!DOCTYPE html>
<html>
  <head><title>Job Posting</title></head>
  <body>
    <footer class="sidebar-widget">
      <ul>
        <li>Title: Senior Backend Engineer</li>
        <li>Company: Acme Corp</li>
        <li>Location: Remote, US only</li>
        <li>Team: Payments Platform Infrastructure</li>
        <li>Salary: $160,000 - $190,000 annually plus equity</li>
      </ul>
    </footer>
  </body>
</html>
`;

describe('fetchAndExtractText', () => {
  it('extracts readable text via Readability from an article-shaped page', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => ARTICLE_HTML,
    }) as unknown as typeof fetch;

    const text = await fetchAndExtractText('https://acme.example/jobs/42');

    expect(text).toContain('Senior Backend Engineer');
    expect(text).toContain('payments platform team');
    expect(text.length).toBeGreaterThan(200);
  });

  it('extracts readable text via Readability from a table-shaped page', async () => {
    // Note: despite the table layout, Readability's own algorithm succeeds here (it
    // returns ~335 chars of usable text from the table's cell content), so this test
    // does NOT exercise the html-to-text fallback — see the next test for that.
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => TABLE_LAYOUT_HTML,
    }) as unknown as typeof fetch;

    const text = await fetchAndExtractText('https://acme.example/jobs/42');

    expect(text).toContain('Senior Backend Engineer');
    expect(text).toContain('Acme Corp');
    expect(text).toContain('payments platform team');
  });

  it('falls back to html-to-text when Readability finds no usable article content', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => SIDEBAR_WIDGET_HTML,
    }) as unknown as typeof fetch;

    const text = await fetchAndExtractText('https://acme.example/jobs/42');

    expect(text).toContain('Senior Backend Engineer');
    expect(text).toContain('Acme Corp');
    expect(text).toContain('Payments Platform Infrastructure');
  });

  it('throws FetchBlockedError when the HTTP response is not ok', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      text: async () => '',
    }) as unknown as typeof fetch;

    await expect(fetchAndExtractText('https://linkedin.example/jobs/1')).rejects.toThrow(FetchBlockedError);
  });

  it('throws FetchBlockedError when fetch itself rejects (network error/timeout)', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('network error')) as unknown as typeof fetch;

    await expect(fetchAndExtractText('https://unreachable.example/jobs/1')).rejects.toThrow(FetchBlockedError);
  });

  it('throws FetchBlockedError when neither Readability nor html-to-text find usable text', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => '<html><body></body></html>',
    }) as unknown as typeof fetch;

    await expect(fetchAndExtractText('https://acme.example/empty')).rejects.toThrow(FetchBlockedError);
  });
});
