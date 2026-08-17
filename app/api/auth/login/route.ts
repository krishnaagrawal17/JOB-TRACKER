import { NextRequest, NextResponse } from 'next/server';
import { verifyPassword } from '@/lib/auth/password';
import { clearFailures, isLockedOut, recordFailure } from '@/lib/auth/rateLimit';
import { SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS, signSession } from '@/lib/auth/session';

export const runtime = 'nodejs';

interface LoginRequestBody {
  password?: unknown;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Checked before the password, so a lockout cannot be probed with a correct guess.
  if (isLockedOut()) {
    return NextResponse.json(
      { error: 'Too many failed attempts. Try again in 15 minutes.' },
      { status: 429 },
    );
  }

  const hash = process.env.AUTH_PASSWORD_HASH;
  const secret = process.env.AUTH_SESSION_SECRET;
  if (!hash || !secret) {
    return NextResponse.json(
      { error: 'Authentication is not configured. Run `npm run set-password`.' },
      { status: 500 },
    );
  }

  let body: LoginRequestBody;
  try {
    body = (await request.json()) as LoginRequestBody;
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  if (typeof body.password !== 'string') {
    return NextResponse.json({ error: 'password must be a string.' }, { status: 400 });
  }

  if (!(await verifyPassword(body.password, hash))) {
    recordFailure();
    return NextResponse.json({ error: 'Incorrect password.' }, { status: 401 });
  }

  clearFailures();

  const expiresAt = Date.now() + SESSION_MAX_AGE_SECONDS * 1000;
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE_NAME, await signSession(expiresAt, secret), {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
    secure: process.env.NODE_ENV === 'production',
  });
  return response;
}
