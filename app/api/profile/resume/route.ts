import { NextRequest, NextResponse } from 'next/server';
import { getDb, upsertProfile } from '@/lib/db';
import { getRequestUserId } from '@/lib/auth/getRequestUserId';
import { extractResumeText } from '@/lib/resumeParse';

export const runtime = 'nodejs';

const SUPPORTED_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

export async function POST(request: NextRequest): Promise<NextResponse> {
  const userId = getRequestUserId(request);
  const formData = await request.formData();
  const file = formData.get('resume');

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'resume file is required.' }, { status: 400 });
  }

  if (!SUPPORTED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: 'Only PDF and DOCX resumes are supported.' }, { status: 400 });
  }

  try {
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const resumeText = await extractResumeText(buffer, file.type);

    const db = getDb();
    const profile = upsertProfile(db, userId, {
      resumeText,
      resumeFilename: file.name,
      resumeUploadedAt: new Date().toISOString(),
    });

    return NextResponse.json({ profile });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Resume parsing failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
