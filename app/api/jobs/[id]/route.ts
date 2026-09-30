import { NextRequest, NextResponse } from 'next/server';
import { getDb, getJob, updateJob, deleteJob, getKit } from '@/lib/db';
import { getRequestUserId } from '@/lib/auth/getRequestUserId';
import type { Stage } from '@/lib/types';

export const runtime = 'nodejs';

const VALID_STAGES: Stage[] = ['wishlist', 'applied', 'interviewing', 'offer', 'rejected'];

interface RouteParams {
  params: Promise<{ id: string }>;
}

interface PatchRequestBody {
  stage?: unknown;
  position?: unknown;
  title?: unknown;
  company?: unknown;
  location?: unknown;
  salary?: unknown;
  description?: unknown;
  sourceUrl?: unknown;
  extraFields?: unknown;
}

export async function GET(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { id } = await params;
  const jobId = Number(id);
  if (!Number.isInteger(jobId)) {
    return NextResponse.json({ error: 'Invalid job id.' }, { status: 400 });
  }

  const userId = getRequestUserId(request);
  const db = getDb();
  const job = getJob(db, userId, jobId);
  if (!job) {
    return NextResponse.json({ error: 'Job not found.' }, { status: 404 });
  }

  const kit = getKit(db, userId, jobId) ?? null;
  return NextResponse.json({ job, kit });
}

export async function PATCH(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { id } = await params;
  const jobId = Number(id);
  if (!Number.isInteger(jobId)) {
    return NextResponse.json({ error: 'Invalid job id.' }, { status: 400 });
  }

  const body = (await request.json()) as PatchRequestBody;

  if (body.stage !== undefined && !VALID_STAGES.includes(body.stage as Stage)) {
    return NextResponse.json({ error: 'stage must be one of: ' + VALID_STAGES.join(', ') }, { status: 400 });
  }
  if (body.stage !== undefined && body.position === undefined) {
    return NextResponse.json({ error: 'position is required when moving stage.' }, { status: 400 });
  }
  if (body.position !== undefined && typeof body.position !== 'number') {
    return NextResponse.json({ error: 'position must be a number.' }, { status: 400 });
  }

  const userId = getRequestUserId(request);
  const db = getDb();
  const job = updateJob(db, userId, jobId, {
    stage: body.stage as Stage | undefined,
    position: body.position as number | undefined,
    title: body.title !== undefined ? (body.title as string | null) : undefined,
    company: body.company !== undefined ? (body.company as string | null) : undefined,
    location: body.location !== undefined ? (body.location as string | null) : undefined,
    salary: body.salary !== undefined ? (body.salary as string | null) : undefined,
    description: body.description !== undefined ? (body.description as string | null) : undefined,
    sourceUrl: body.sourceUrl !== undefined ? (body.sourceUrl as string | null) : undefined,
    extraFields: body.extraFields !== undefined ? (body.extraFields as Record<string, string> | null) : undefined,
  });

  if (!job) {
    return NextResponse.json({ error: 'Job not found.' }, { status: 404 });
  }

  return NextResponse.json({ job });
}

export async function DELETE(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { id } = await params;
  const jobId = Number(id);
  if (!Number.isInteger(jobId)) {
    return NextResponse.json({ error: 'Invalid job id.' }, { status: 400 });
  }

  const userId = getRequestUserId(request);
  const db = getDb();
  const existing = getJob(db, userId, jobId);
  if (!existing) {
    return NextResponse.json({ error: 'Job not found.' }, { status: 404 });
  }

  deleteJob(db, userId, jobId);
  return NextResponse.json({ success: true });
}
