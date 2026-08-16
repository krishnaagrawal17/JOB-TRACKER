import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb, getJob, getProfile, upsertKitField, editKitField, getKit, type KitField } from '@/lib/db';
import { callOpenRouter } from '@/lib/openrouter';
import {
  buildCoverLetterPrompt,
  buildBulletsPrompt,
  buildQuestionsPrompt,
  buildCompanyBriefPrompt,
} from '@/lib/prompts';
import { TEXT_MODEL_SLUG, WEB_MODEL_SLUG } from '@/lib/models';
import type { Profile } from '@/lib/types';

export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{ id: string }>;
}

const StringArraySchema = z.array(z.string());

/** Parses and shape-validates a JSON string-array response from the LLM.
 * Throws (rather than returning a lying `as string[]` cast) so the caller's
 * task promise rejects and routes into the existing Promise.allSettled
 * partial-failure handling instead of persisting malformed data. */
function parseStringArrayResponse(content: string, fieldLabel: string): string[] {
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(content);
  } catch {
    throw new Error(`Model returned invalid JSON for ${fieldLabel}.`);
  }

  const result = StringArraySchema.safeParse(parsedJson);
  if (!result.success) {
    throw new Error(`Model returned an unexpected shape for ${fieldLabel} (expected an array of strings).`);
  }

  return result.data;
}

export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { id } = await params;
  const jobId = Number(id);
  if (!Number.isInteger(jobId)) {
    return NextResponse.json({ error: 'Invalid job id.' }, { status: 400 });
  }

  const db = getDb();
  const job = getJob(db, jobId);
  if (!job) {
    return NextResponse.json({ error: 'Job not found.' }, { status: 404 });
  }

  const profile: Profile =
    getProfile(db) ?? {
      id: 1,
      resumeText: null,
      resumeFilename: null,
      resumeUploadedAt: null,
      aboutMe: null,
      updatedAt: new Date().toISOString(),
    };

  const tasks: { field: KitField; run: () => Promise<void> }[] = [
    {
      field: 'cover_letter',
      run: async () => {
        const content = await callOpenRouter({
          model: TEXT_MODEL_SLUG,
          messages: [{ role: 'user', content: buildCoverLetterPrompt(job, profile) }],
        });
        upsertKitField(db, { jobId, field: 'cover_letter', value: content.trim(), model: TEXT_MODEL_SLUG });
      },
    },
    {
      field: 'resume_bullets',
      run: async () => {
        const content = await callOpenRouter({
          model: TEXT_MODEL_SLUG,
          messages: [{ role: 'user', content: buildBulletsPrompt(job, profile) }],
        });
        const bullets = parseStringArrayResponse(content, 'resume_bullets');
        upsertKitField(db, { jobId, field: 'resume_bullets', value: JSON.stringify(bullets), model: TEXT_MODEL_SLUG });
      },
    },
    {
      field: 'interview_questions',
      run: async () => {
        const content = await callOpenRouter({
          model: TEXT_MODEL_SLUG,
          messages: [{ role: 'user', content: buildQuestionsPrompt(job, profile) }],
        });
        const questions = parseStringArrayResponse(content, 'interview_questions');
        upsertKitField(db, {
          jobId,
          field: 'interview_questions',
          value: JSON.stringify(questions),
          model: TEXT_MODEL_SLUG,
        });
      },
    },
    {
      field: 'company_brief',
      run: async () => {
        const content = await callOpenRouter({
          model: WEB_MODEL_SLUG,
          messages: [{ role: 'user', content: buildCompanyBriefPrompt(job) }],
          plugins: [{ id: 'web', max_results: 5 }],
        });
        // No `sources` is passed here on purpose: the web plugin's citation annotations
        // are deliberately discarded in v1 (callOpenRouter returns only the content
        // string), so company_brief_sources stays null and CompanyBriefSection's citation
        // list never renders. The column, parsing, and UI are kept for a future phase
        // that threads annotations through — this is deferred scope, not a bug.
        upsertKitField(db, { jobId, field: 'company_brief', value: content.trim(), model: WEB_MODEL_SLUG });
      },
    },
  ];

  const settled = await Promise.allSettled(tasks.map((task) => task.run()));

  const errors: Record<string, string> = {};
  settled.forEach((result, index) => {
    if (result.status === 'rejected') {
      const field = tasks[index].field;
      errors[field] = result.reason instanceof Error ? result.reason.message : 'Generation failed';
    }
  });

  const kit = getKit(db, jobId) ?? null;
  const partial = Object.keys(errors).length > 0;

  return NextResponse.json({ kit, partial, errors });
}

const EDITABLE_FIELDS: KitField[] = ['cover_letter', 'resume_bullets', 'interview_questions', 'company_brief'];

interface PatchKitRequestBody {
  field?: unknown;
  value?: unknown;
}

export async function PATCH(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { id } = await params;
  const jobId = Number(id);
  if (!Number.isInteger(jobId)) {
    return NextResponse.json({ error: 'Invalid job id.' }, { status: 400 });
  }

  const db = getDb();
  const job = getJob(db, jobId);
  if (!job) {
    return NextResponse.json({ error: 'Job not found.' }, { status: 404 });
  }

  const body = (await request.json()) as PatchKitRequestBody;
  if (typeof body.field !== 'string' || !EDITABLE_FIELDS.includes(body.field as KitField)) {
    return NextResponse.json({ error: 'field must be one of: ' + EDITABLE_FIELDS.join(', ') }, { status: 400 });
  }

  const field = body.field as KitField;
  const isArrayField = field === 'resume_bullets' || field === 'interview_questions';

  let value: string;
  if (isArrayField) {
    const parsed = StringArraySchema.safeParse(body.value);
    if (!parsed.success) {
      return NextResponse.json({ error: 'value must be an array of strings for this field.' }, { status: 400 });
    }
    value = JSON.stringify(parsed.data);
  } else {
    if (typeof body.value !== 'string') {
      return NextResponse.json({ error: 'value must be a string for this field.' }, { status: 400 });
    }
    value = body.value;
  }

  // editKitField (not upsertKitField) is deliberate: a human edit must not overwrite
  // <field>_generated_at, model_text/model_web, or company_brief_sources — those describe
  // how/when the model generated the content, not when it was last touched by a person.
  const kit = editKitField(db, { jobId, field, value });

  return NextResponse.json({ kit });
}
