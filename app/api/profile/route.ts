import { NextRequest, NextResponse } from 'next/server';
import { getDb, getProfile, upsertProfile } from '@/lib/db';
import { getRequestUserId } from '@/lib/auth/getRequestUserId';

export const runtime = 'nodejs';

interface PatchProfileRequestBody {
  resumeText?: unknown;
  aboutMe?: unknown;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const userId = getRequestUserId(request);
  const db = getDb();
  const profile = getProfile(db, userId) ?? null;
  return NextResponse.json({ profile });
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const userId = getRequestUserId(request);
  const body = (await request.json()) as PatchProfileRequestBody;

  if (body.resumeText !== undefined && body.resumeText !== null && typeof body.resumeText !== 'string') {
    return NextResponse.json({ error: 'resumeText must be a string or null.' }, { status: 400 });
  }
  if (body.aboutMe !== undefined && body.aboutMe !== null && typeof body.aboutMe !== 'string') {
    return NextResponse.json({ error: 'aboutMe must be a string or null.' }, { status: 400 });
  }

  const db = getDb();
  const profile = upsertProfile(db, userId, {
    resumeText: body.resumeText as string | null | undefined,
    aboutMe: body.aboutMe as string | null | undefined,
  });

  return NextResponse.json({ profile });
}
