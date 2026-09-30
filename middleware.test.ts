import { NextRequest } from 'next/server';
import { signSession, SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS } from '@/lib/auth/session';
import { middleware } from './middleware';

const SECRET = 'middleware-test-secret';
const USER_ID = 1;

function request(pathname: string, cookie?: string): NextRequest {
  const req = new NextRequest(`http://localhost:3000${pathname}`);
  if (cookie) req.cookies.set(SESSION_COOKIE_NAME, cookie);
  return req;
}

async function validCookie(): Promise<string> {
  return signSession(USER_ID, Date.now() + SESSION_MAX_AGE_SECONDS * 1000, SECRET);
}

beforeEach(() => {
  process.env.AUTH_SESSION_SECRET = SECRET;
});

afterEach(() => {
  delete process.env.AUTH_SESSION_SECRET;
});

describe('middleware gate', () => {
  it.each(['/login', '/register', '/api/auth/login', '/api/auth/logout', '/api/auth/register'])(
    'lets %s through without a session',
    async (path) => {
      expect((await middleware(request(path))).status).toBe(200);
    },
  );

  it('redirects an unauthenticated page request to /login with next', async () => {
    const response = await middleware(request('/profile'));
    expect(response.status).toBe(307);
    const location = new URL(response.headers.get('location') as string);
    expect(location.pathname).toBe('/login');
    expect(location.searchParams.get('next')).toBe('/profile');
  });

  it('returns 401 JSON for an unauthenticated API request', async () => {
    const response = await middleware(request('/api/jobs'));
    expect(response.status).toBe(401);
    expect(response.headers.get('content-type')).toContain('application/json');
  });

  it('allows a page request carrying a valid session', async () => {
    expect((await middleware(request('/profile', await validCookie()))).status).toBe(200);
  });

  it('allows an API request carrying a valid session', async () => {
    expect((await middleware(request('/api/jobs', await validCookie()))).status).toBe(200);
  });

  it('forwards X-User-Id header for authenticated requests', async () => {
    const cookie = await validCookie();
    const response = await middleware(request('/api/jobs', cookie));
    expect(response.status).toBe(200);
    // NextResponse.next({ request: { headers } }) encodes rewritten request headers
    // as x-middleware-request-<name> on the response — see next/dist/server/web/
    // spec-extension/response.js — so this is a real assertion, not a stand-in.
    expect(response.headers.get('x-middleware-request-x-user-id')).toBe(String(USER_ID));
  });

  it('rejects a forged cookie', async () => {
    const forged = await signSession(USER_ID, Date.now() + 60_000, 'the-wrong-secret');
    expect((await middleware(request('/api/jobs', forged))).status).toBe(401);
  });

  it('rejects an expired cookie', async () => {
    const expired = await signSession(USER_ID, Date.now() - 1, SECRET);
    expect((await middleware(request('/api/jobs', expired))).status).toBe(401);
  });

  it('fails closed when auth is not configured', async () => {
    delete process.env.AUTH_SESSION_SECRET;
    expect((await middleware(request('/api/jobs', await validCookie()))).status).toBe(503);
  });

  it('still lets /login through when auth is not configured', async () => {
    delete process.env.AUTH_SESSION_SECRET;
    expect((await middleware(request('/login'))).status).toBe(200);
  });
});
