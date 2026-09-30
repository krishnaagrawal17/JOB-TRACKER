import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE_NAME, verifySession } from '@/lib/auth/session';

/**
 * EDGE RUNTIME. Only `lib/auth/session.ts` may be imported here — it is written
 * against Web Crypto. Importing `lib/auth/password.ts` would pull `node:crypto`
 * into the Edge bundle and fail at runtime.
 */
const PUBLIC_PATHS = new Set([
  '/login',
  '/register',
  '/api/auth/login',
  '/api/auth/logout',
  '/api/auth/register',
]);

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;
  const isApi = pathname.startsWith('/api/');

  if (PUBLIC_PATHS.has(pathname)) return NextResponse.next();

  const secret = process.env.AUTH_SESSION_SECRET;
  if (!secret) {
    // Fail closed. Never fall through to NextResponse.next() here.
    return NextResponse.json(
      { error: 'Authentication is not configured.' },
      { status: 503 },
    );
  }

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (token) {
    const session = await verifySession(token, secret);
    if (session) {
      // Forward the authenticated user's id to API route handlers via a trusted header.
      // This header is set by middleware (server-side) and cannot be spoofed by clients.
      const headers = new Headers(request.headers);
      headers.set('X-User-Id', String(session.userId));
      return NextResponse.next({ request: { headers } });
    }
  }

  if (isApi) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  }

  const loginUrl = new URL('/login', request.url);
  loginUrl.searchParams.set('next', pathname);
  return NextResponse.redirect(loginUrl);
}
