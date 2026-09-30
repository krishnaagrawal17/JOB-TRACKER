import fs from 'fs';
import os from 'os';
import path from 'path';
import { NextRequest } from 'next/server';
import { createDb, createUser, getUserByEmail, type Db } from '@/lib/db';
import { resetRateLimitForTests, MAX_ATTEMPTS } from '@/lib/auth/rateLimit';
import { hashPassword } from '@/lib/auth/password';
import { SESSION_COOKIE_NAME } from '@/lib/auth/session';

let db: Db;
let dbPath: string;

const EMAIL = 'test@example.com';
const PASSWORD = 'a-good-test-password';
const OTHER_EMAIL = 'other@example.com';
const OTHER_PASSWORD = 'another-good-password';

vi.mock('@/lib/db', async () => {
  const actual = await vi.importActual<typeof import('@/lib/db')>('@/lib/db');
  return { ...actual, getDb: () => db };
});

import { POST } from './route';

function cleanupDbFile(p: string) {
  for (const suffix of ['', '-journal', '-wal', '-shm']) {
    fs.rmSync(`${p}${suffix}`, { force: true });
  }
}

function post(email: unknown, password: unknown): NextRequest {
  return new NextRequest('http://localhost:3000/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(async () => {
  dbPath = path.join(os.tmpdir(), `job-tracker-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
  db = createDb(dbPath);
  // Create the test user with a real password hash.
  const hash = await hashPassword(PASSWORD);
  createUser(db, EMAIL, hash);
  const otherHash = await hashPassword(OTHER_PASSWORD);
  createUser(db, OTHER_EMAIL, otherHash);
  resetRateLimitForTests();
  process.env.AUTH_SESSION_SECRET = 'test-session-secret';
});

afterEach(() => {
  db.close();
  cleanupDbFile(dbPath);
  delete process.env.AUTH_SESSION_SECRET;
});

describe('POST /api/auth/login', () => {
  it('sets a session cookie for the correct email and password', async () => {
    const response = await POST(post(EMAIL, PASSWORD));
    expect(response.status).toBe(200);
    expect(response.cookies.get(SESSION_COOKIE_NAME)?.value).toBeTruthy();
  });

  it('rejects the wrong password with 401 and no cookie', async () => {
    const response = await POST(post(EMAIL, 'nope'));
    expect(response.status).toBe(401);
    expect(response.cookies.get(SESSION_COOKIE_NAME)).toBeUndefined();
  });

  it('rejects an unknown email with 401 and no cookie', async () => {
    const response = await POST(post('unknown@example.com', PASSWORD));
    expect(response.status).toBe(401);
    expect(response.cookies.get(SESSION_COOKIE_NAME)).toBeUndefined();
  });

  it('rejects a non-string password with 400', async () => {
    expect((await POST(post(EMAIL, 12345))).status).toBe(400);
  });

  it('rejects a missing email with 400', async () => {
    expect((await POST(post('', PASSWORD))).status).toBe(400);
  });

  it('returns 429 on the attempt after the limit is reached', async () => {
    for (let i = 0; i < MAX_ATTEMPTS; i += 1) {
      expect((await POST(post(EMAIL, 'wrong'))).status).toBe(401);
    }
    expect((await POST(post(EMAIL, 'wrong'))).status).toBe(429);
  });

  it('returns 429 for the CORRECT password while locked out', async () => {
    for (let i = 0; i < MAX_ATTEMPTS; i += 1) await POST(post(EMAIL, 'wrong'));
    expect((await POST(post(EMAIL, PASSWORD))).status).toBe(429);
  });

  it('clears the failure counter after a success', async () => {
    await POST(post(EMAIL, 'wrong'));
    await POST(post(EMAIL, 'wrong'));
    expect((await POST(post(EMAIL, PASSWORD))).status).toBe(200);
    for (let i = 0; i < MAX_ATTEMPTS; i += 1) {
      expect((await POST(post(EMAIL, 'wrong'))).status).toBe(401);
    }
  });

  it('does not lock out a different account after one account is locked out', async () => {
    for (let i = 0; i < MAX_ATTEMPTS; i += 1) {
      expect((await POST(post(EMAIL, 'wrong'))).status).toBe(401);
    }
    expect((await POST(post(EMAIL, PASSWORD))).status).toBe(429);
    // A second, unrelated account must still be able to log in normally.
    const response = await POST(post(OTHER_EMAIL, OTHER_PASSWORD));
    expect(response.status).toBe(200);
    expect(response.cookies.get(SESSION_COOKIE_NAME)?.value).toBeTruthy();
  });

  it('fails closed with 500 when the session secret is not configured', async () => {
    delete process.env.AUTH_SESSION_SECRET;
    expect((await POST(post(EMAIL, PASSWORD))).status).toBe(500);
  });
});
