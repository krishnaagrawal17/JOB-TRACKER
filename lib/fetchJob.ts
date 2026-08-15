import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import { convert } from 'html-to-text';

export class FetchBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FetchBlockedError';
  }
}

const USER_AGENT = 'Mozilla/5.0 (compatible; JobTrackerBot/1.0; +https://localhost)';
const FETCH_TIMEOUT_MS = 10_000;
const MIN_USABLE_LENGTH = 100;

export async function fetchAndExtractText(url: string): Promise<string> {
  const html = await fetchHtml(url);

  const readabilityText = extractWithReadability(html, url);
  if (readabilityText && readabilityText.length >= MIN_USABLE_LENGTH) {
    return readabilityText;
  }

  const fallbackText = extractWithHtmlToText(html);
  if (fallbackText && fallbackText.length >= MIN_USABLE_LENGTH) {
    return fallbackText;
  }

  throw new FetchBlockedError(
    'Could not extract readable text from this page — paste the job description text instead.'
  );
}

async function fetchHtml(url: string): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new FetchBlockedError(
        `Fetching this URL failed (HTTP ${response.status}) — paste the job description text instead.`
      );
    }

    return await response.text();
  } catch (err) {
    if (err instanceof FetchBlockedError) {
      throw err;
    }
    throw new FetchBlockedError('Could not fetch this URL — paste the job description text instead.');
  } finally {
    clearTimeout(timeoutId);
  }
}

function extractWithReadability(html: string, url: string): string | null {
  try {
    const dom = new JSDOM(html, { url });
    const reader = new Readability(dom.window.document);
    const article = reader.parse();
    return article?.textContent?.trim() ?? null;
  } catch {
    return null;
  }
}

function extractWithHtmlToText(html: string): string | null {
  try {
    const text = convert(html, { wordwrap: false }).trim();
    return text.length > 0 ? text : null;
  } catch {
    return null;
  }
}
