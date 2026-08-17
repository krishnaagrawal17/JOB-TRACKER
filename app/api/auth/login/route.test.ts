import { NextRequest } from 'next/server';
import { hashPassword } from '@/lib/auth/password';
import { resetRateLimitForTests, MAX_ATTEMPTS } from '@/lib/auth/rateLimit';
import { SESSION_COOKIE_NAME } from '@/lib/auth/session';

const PASSWORD = 'a-good-test-password';

function post(password: unknown): NextRequest {
  return new NextRequest('http://localhost:3000/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ password }),
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(async () => {
  resetRateLimitForTests();
  process.env.AUTH_PASSWORD_HASH = await hashPassword(PASSWORD);
  process.env.AUTH_SESSION_SECRET = 'test-session-secret';
});

describe('POST /api/auth/login', () => {
  it('sets a session cookie for the correct password', async () => {
    const { POST } = await import('./route');
    const response = await POST(post(PASSWORD));
    expect(response.status).toBe(200);
    expect(response.cookies.get(SESSION_COOKIE_NAME)?.value).toBeTruthy();
  });

  it('rejects the wrong password with 401 and no cookie', async () => {
    const { POST } = await import('./route');
    const response = await POST(post('nope'));
    expect(response.status).toBe(401);
    expect(response.cookies.get(SESSION_COOKIE_NAME)).toBeUndefined();
  });

  it('rejects a non-string password with 400', async () => {
    const { POST } = await import('./route');
    expect((await POST(post(12345))).status).toBe(400);
  });

  it('returns 429 on the attempt after the limit is reached', async () => {
    const { POST } = await import('./route');
    for (let i = 0; i < MAX_ATTEMPTS; i += 1) {
      expect((await POST(post('wrong'))).status).toBe(401);
    }
    expect((await POST(post('wrong'))).status).toBe(429);
  });

  it('returns 429 for the CORRECT password while locked out', async () => {
    const { POST } = await import('./route');
    for (let i = 0; i < MAX_ATTEMPTS; i += 1) await POST(post('wrong'));
    expect((await POST(post(PASSWORD))).status).toBe(429);
  });

  it('clears the failure counter after a success', async () => {
    const { POST } = await import('./route');
    await POST(post('wrong'));
    await POST(post('wrong'));
    expect((await POST(post(PASSWORD))).status).toBe(200);
    for (let i = 0; i < MAX_ATTEMPTS; i += 1) {
      expect((await POST(post('wrong'))).status).toBe(401);
    }
  });

  it('fails closed with 500 when the password hash is not configured', async () => {
    delete process.env.AUTH_PASSWORD_HASH;
    const { POST } = await import('./route');
    expect((await POST(post(PASSWORD))).status).toBe(500);
  });

  it('fails closed with 500 when the session secret is not configured', async () => {
    delete process.env.AUTH_SESSION_SECRET;
    const { POST } = await import('./route');
    expect((await POST(post(PASSWORD))).status).toBe(500);
  });
});
