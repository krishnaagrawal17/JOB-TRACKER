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

    const parsed = ExtractedJobSchema.safeParse(JSON.parse(content));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Extraction returned an unexpected shape.' }, { status: 502 });
    }

    return NextResponse.json({ extracted: parsed.data, rawText });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Extraction failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
