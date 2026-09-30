import fs from 'fs';
import os from 'os';
import path from 'path';
import { NextRequest } from 'next/server';
import { createDb, createUser, upsertProfile, type Db } from '@/lib/db';

let db: Db;
let dbPath: string;
let userId: number;

vi.mock('@/lib/db', async () => {
  const actual = await vi.importActual<typeof import('@/lib/db')>('@/lib/db');
  return { ...actual, getDb: () => db };
});

import { GET, PATCH } from './route';

function cleanupDbFile(p: string) {
  for (const suffix of ['', '-journal', '-wal', '-shm']) {
    fs.rmSync(`${p}${suffix}`, { force: true });
  }
}

beforeEach(() => {
  dbPath = path.join(os.tmpdir(), `job-tracker-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
  db = createDb(dbPath);
  const user = createUser(db, 'test@example.com', 'hash');
  userId = user.id;
});

afterEach(() => {
  db.close();
  cleanupDbFile(dbPath);
});

function makeGetRequest() {
  return new NextRequest('http://localhost/api/profile', {
    headers: { 'X-User-Id': String(userId) },
  });
}

function makePatchRequest(body: unknown) {
  return new NextRequest('http://localhost/api/profile', {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json', 'X-User-Id': String(userId) },
  });
}

describe('GET /api/profile', () => {
  it('returns null before any profile exists', async () => {
    const res = await GET(makeGetRequest());
    const json = await res.json();
    expect(json.profile).toBeNull();
  });

  it('returns the stored profile', async () => {
    upsertProfile(db, userId, { resumeText: 'Resume text', aboutMe: 'About me' });
    const res = await GET(makeGetRequest());
    const json = await res.json();
    expect(json.profile.resumeText).toBe('Resume text');
  });
});

describe('PATCH /api/profile', () => {
  it('creates the profile on first write', async () => {
    const res = await PATCH(makePatchRequest({ resumeText: 'New resume', aboutMe: 'New about' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.profile.resumeText).toBe('New resume');
    expect(json.profile.aboutMe).toBe('New about');
  });

  it('updates only the fields provided', async () => {
    upsertProfile(db, userId, { resumeText: 'Original', aboutMe: 'Original about' });
    const res = await PATCH(makePatchRequest({ aboutMe: 'Updated about' }));
    const json = await res.json();
    expect(json.profile.resumeText).toBe('Original');
    expect(json.profile.aboutMe).toBe('Updated about');
  });

  it('returns 400 when resumeText is not a string or null', async () => {
    const res = await PATCH(makePatchRequest({ resumeText: 12345 }));
    expect(res.status).toBe(400);
  });
});
