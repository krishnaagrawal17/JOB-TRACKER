import { NextRequest, NextResponse } from 'next/server';
import { verifyPassword } from '@/lib/auth/password';
import { clearFailures, isLockedOut, recordFailure } from '@/lib/auth/rateLimit';
import { SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS, signSession } from '@/lib/auth/session';
import { getDb, getUserByEmail } from '@/lib/db';

export const runtime = 'nodejs';

interface LoginRequestBody {
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

  let body: LoginRequestBody;
  try {
    body = (await request.json()) as LoginRequestBody;
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  if (typeof body.email !== 'string' || !body.email.trim()) {
    return NextResponse.json({ error: 'email must be a non-empty string.' }, { status: 400 });
  }

  if (typeof body.password !== 'string') {
    return NextResponse.json({ error: 'password must be a string.' }, { status: 400 });
  }

  const email = body.email.trim();

  // Checked before the password, so a lockout cannot be probed with a correct guess.
  // Keyed per email so one account's failed attempts can't lock out every other user.
  if (isLockedOut(email)) {
    return NextResponse.json(
      { error: 'Too many failed attempts. Try again in 15 minutes.' },
      { status: 429 },
    );
  }

  const db = getDb();
  const user = getUserByEmail(db, email);

  // Always run verifyPassword even if user doesn't exist to avoid timing attacks.
  const DUMMY_HASH = 'aabbccdd:aabbccddaabbccddaabbccddaabbccddaabbccddaabbccddaabbccddaabbccdd';
  const passwordOk = user
    ? await verifyPassword(body.password, user.passwordHash)
    : await verifyPassword(body.password, DUMMY_HASH).then(() => false);

  if (!user || !passwordOk) {
    recordFailure(email);
    return NextResponse.json({ error: 'Incorrect email or password.' }, { status: 401 });
  }

  clearFailures(email);

  const expiresAt = Date.now() + SESSION_MAX_AGE_SECONDS * 1000;
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE_NAME, await signSession(user.id, expiresAt, secret), {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
    secure: process.env.NODE_ENV === 'production',
  });
  return response;
}
