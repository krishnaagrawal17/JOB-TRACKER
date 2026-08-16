import { NextRequest, NextResponse } from 'next/server';
import { fetchAndExtractText, FetchBlockedError } from '@/lib/fetchJob';
import { callOpenRouter } from '@/lib/openrouter';
import { buildExtractionPrompt } from '@/lib/prompts';
import { TEXT_MODEL_SLUG } from '@/lib/models';
import { ExtractedJobSchema } from '@/lib/types';

interface ExtractRequestBody {
  url?: unknown;
  text?: unknown;
}

/** Strips a surrounding ```json ... ``` (or bare ``` ... ```) fence.
 * `response_format: { type: 'json_object' }` support is provider-dependent on
 * OpenRouter, so the prompt's "no code fences" instruction is the only thing standing
 * between us and a fenced payload — and extraction is the sole way to create a job. */
function stripCodeFence(content: string): string {
  const trimmed = content.trim();
  const fenced = /^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/i.exec(trimmed);
  return fenced ? fenced[1].trim() : trimmed;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = (await request.json()) as ExtractRequestBody;

  const hasUrl = typeof body.url === 'string' && body.url.trim().length > 0;
  const hasText = typeof body.text === 'string' && body.text.trim().length > 0;

  if (!hasUrl && !hasText) {
    return NextResponse.json({ error: 'Provide either a url or text.' }, { status: 400 });
  }

  let rawText: string;
  if (hasUrl) {
    try {
      rawText = await fetchAndExtractText(body.url as string);
    } catch (err) {
      if (err instanceof FetchBlockedError) {
        return NextResponse.json({ error: err.message, blocked: true }, { status: 422 });
      }
      throw err;
    }
  } else {
    rawText = (body.text as string).trim();
  }

  try {
    const content = await callOpenRouter({
      model: TEXT_MODEL_SLUG,
      messages: [{ role: 'user', content: buildExtractionPrompt(rawText) }],
      responseFormat: { type: 'json_object' },
    });

    // Parsed outside the outer try's catch-all so a malformed model response can't
    // surface as a 500 carrying a raw V8 message ("Unexpected token `") to the user.
    let rawJson: unknown;
    try {
      rawJson = JSON.parse(stripCodeFence(content));
    } catch {
      return NextResponse.json({ error: 'Extraction returned an unreadable response. Try again.' }, { status: 502 });
    }

    const parsed = ExtractedJobSchema.safeParse(rawJson);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Extraction returned an unexpected shape.' }, { status: 502 });
    }

    return NextResponse.json({ extracted: parsed.data, rawText });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Extraction failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
