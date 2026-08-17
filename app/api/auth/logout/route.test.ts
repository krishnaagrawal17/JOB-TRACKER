import { NextRequest } from 'next/server';
import { SESSION_COOKIE_NAME } from '@/lib/auth/session';

function post(): NextRequest {
  return new NextRequest('http://localhost:3000/api/auth/logout', {
    method: 'POST',
  });
}

describe('POST /api/auth/logout', () => {
  it('redirects to /login with a 303', async () => {
    const { POST } = await import('./route');
    const response = await POST(post());
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('http://localhost:3000/login');
  });

  it('clears the session cookie', async () => {
    const { POST } = await import('./route');
    const response = await POST(post());
    const cookie = response.cookies.get(SESSION_COOKIE_NAME);
    expect(cookie?.value).toBe('');
    expect(cookie?.maxAge).toBe(0);
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe('lax');
    expect(cookie?.path).toBe('/');
  });
});
