import fs from 'fs';
import os from 'os';
import path from 'path';
import { NextRequest } from 'next/server';
import { createDb, getUserByEmail, type Db } from '@/lib/db';
import { verifyPassword } from '@/lib/auth/password';
import { SESSION_COOKIE_NAME } from '@/lib/auth/session';

let db: Db;
let dbPath: string;

const EMAIL = 'new-user@example.com';
const PASSWORD = 'a-good-test-password';

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

function post(body: unknown): NextRequest {
  return new NextRequest('http://localhost:3000/api/auth/register', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  dbPath = path.join(os.tmpdir(), `job-tracker-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
  db = createDb(dbPath);
  process.env.AUTH_SESSION_SECRET = 'test-session-secret';
});

afterEach(() => {
  db.close();
  cleanupDbFile(dbPath);
  delete process.env.AUTH_SESSION_SECRET;
});

describe('POST /api/auth/register', () => {
  it('creates a user, hashes the password, and sets a session cookie', async () => {
    const response = await POST(post({ email: EMAIL, password: PASSWORD }));
    expect(response.status).toBe(201);
    expect(response.cookies.get(SESSION_COOKIE_NAME)?.value).toBeTruthy();

    const user = getUserByEmail(db, EMAIL.toLowerCase());
    expect(user).toBeDefined();
    expect(user!.passwordHash).not.toBe(PASSWORD);
    expect(await verifyPassword(PASSWORD, user!.passwordHash)).toBe(true);
  });

  it('lowercases the stored email', async () => {
    await POST(post({ email: 'Mixed-Case@Example.com', password: PASSWORD }));
    expect(getUserByEmail(db, 'mixed-case@example.com')).toBeDefined();
  });

  it('rejects a duplicate email with 409 and no cookie', async () => {
    await POST(post({ email: EMAIL, password: PASSWORD }));
    const response = await POST(post({ email: EMAIL, password: 'a-different-password' }));
    expect(response.status).toBe(409);
    expect(response.cookies.get(SESSION_COOKIE_NAME)).toBeUndefined();
  });

  it('rejects a duplicate email that differs only in case', async () => {
    await POST(post({ email: EMAIL, password: PASSWORD }));
    const response = await POST(post({ email: EMAIL.toUpperCase(), password: PASSWORD }));
    expect(response.status).toBe(409);
  });

  it('rejects a malformed email with 400', async () => {
    expect((await POST(post({ email: 'not-an-email', password: PASSWORD }))).status).toBe(400);
  });

  it('rejects a missing email with 400', async () => {
    expect((await POST(post({ email: '', password: PASSWORD }))).status).toBe(400);
  });

  it('rejects a password shorter than 8 characters with 400', async () => {
    expect((await POST(post({ email: EMAIL, password: 'short1' }))).status).toBe(400);
  });

  it('rejects a non-string password with 400', async () => {
    expect((await POST(post({ email: EMAIL, password: 12345678 }))).status).toBe(400);
  });

  it('rejects malformed JSON with 400', async () => {
    const request = new NextRequest('http://localhost:3000/api/auth/register', {
      method: 'POST',
      body: '{not json',
      headers: { 'content-type': 'application/json' },
    });
    expect((await POST(request)).status).toBe(400);
  });

  it('fails closed with 500 when the session secret is not configured', async () => {
    delete process.env.AUTH_SESSION_SECRET;
    expect((await POST(post({ email: EMAIL, password: PASSWORD }))).status).toBe(500);
  });
});
