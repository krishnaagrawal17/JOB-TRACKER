import { NextRequest, NextResponse } from 'next/server';
import { getDb, getJobs, createJob } from '@/lib/db';
import type { Stage } from '@/lib/types';

const VALID_STAGES: Stage[] = ['wishlist', 'applied', 'interviewing', 'offer', 'rejected'];

interface CreateJobRequestBody {
  stage?: unknown;
  title?: unknown;
  company?: unknown;
  location?: unknown;
  salary?: unknown;
  description?: unknown;
  sourceUrl?: unknown;
  rawInput?: unknown;
  extraFields?: unknown;
}

export async function GET(_request: NextRequest): Promise<NextResponse> {
  const db = getDb();
  const jobs = getJobs(db);
  return NextResponse.json({ jobs });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = (await request.json()) as CreateJobRequestBody;

  if (body.stage !== undefined && !VALID_STAGES.includes(body.stage as Stage)) {
    return NextResponse.json({ error: 'stage must be one of: ' + VALID_STAGES.join(', ') }, { status: 400 });
  }

  const db = getDb();
  const job = createJob(db, {
    stage: body.stage as Stage | undefined,
    title: typeof body.title === 'string' ? body.title : null,
    company: typeof body.company === 'string' ? body.company : null,
    location: typeof body.location === 'string' ? body.location : null,
    salary: typeof body.salary === 'string' ? body.salary : null,
    description: typeof body.description === 'string' ? body.description : null,
    sourceUrl: typeof body.sourceUrl === 'string' ? body.sourceUrl : null,
    rawInput: typeof body.rawInput === 'string' ? body.rawInput : null,
    extraFields: (body.extraFields as Record<string, string> | undefined) ?? null,
  });

  return NextResponse.json({ job }, { status: 201 });
}
