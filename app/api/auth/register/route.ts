import { NextRequest, NextResponse } from 'next/server';
import { hashPassword } from '@/lib/auth/password';
import { SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS, signSession } from '@/lib/auth/session';
import { getDb, createUser, getUserByEmail } from '@/lib/db';

export const runtime = 'nodejs';

interface RegisterRequestBody {
  email?: unknown;
  password?: unknown;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const secret = process.env.AUTH_SESSION_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: 'Authentication is not configured.' },
      { status: 500 },
    );
  }

  let body: RegisterRequestBody;
  try {
    body = (await request.json()) as RegisterRequestBody;
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  if (typeof body.email !== 'string' || !body.email.trim()) {
    return NextResponse.json({ error: 'email must be a non-empty string.' }, { status: 400 });
  }

  const emailLower = body.email.trim().toLowerCase();
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailPattern.test(emailLower)) {
    return NextResponse.json({ error: 'email is not valid.' }, { status: 400 });
  }

  if (typeof body.password !== 'string' || body.password.length < 8) {
    return NextResponse.json({ error: 'password must be at least 8 characters.' }, { status: 400 });
  }

  const db = getDb();

  // Check uniqueness before hashing (fast path).
  const existing = getUserByEmail(db, emailLower);
  if (existing) {
    return NextResponse.json({ error: 'An account with that email already exists.' }, { status: 409 });
  }

  const passwordHash = await hashPassword(body.password);

  let user;
  try {
    user = createUser(db, emailLower, passwordHash);
  } catch {
    // UNIQUE constraint race condition.
    return NextResponse.json({ error: 'An account with that email already exists.' }, { status: 409 });
  }

  const expiresAt = Date.now() + SESSION_MAX_AGE_SECONDS * 1000;
  const response = NextResponse.json({ ok: true }, { status: 201 });
  response.cookies.set(SESSION_COOKIE_NAME, await signSession(user.id, expiresAt, secret), {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
    secure: process.env.NODE_ENV === 'production',
  });
  return response;
}
