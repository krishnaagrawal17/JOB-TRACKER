import fs from 'fs';
import os from 'os';
import path from 'path';
import { NextRequest } from 'next/server';
import { createDb, createUser, type Db } from '@/lib/db';

let db: Db;
let dbPath: string;
let userId: number;

vi.mock('@/lib/db', async () => {
  const actual = await vi.importActual<typeof import('@/lib/db')>('@/lib/db');
  return {
    ...actual,
    getDb: () => db,
  };
});

import { GET, POST } from './route';

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
  return new NextRequest('http://localhost/api/jobs', {
    headers: { 'X-User-Id': String(userId) },
  });
}

function makePostRequest(body: unknown) {
  return new NextRequest('http://localhost/api/jobs', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json', 'X-User-Id': String(userId) },
  });
}

describe('GET /api/jobs', () => {
  it('returns an empty list when there are no jobs', async () => {
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.jobs).toEqual([]);
  });

  it('returns created jobs ordered by stage then position', async () => {
    await POST(makePostRequest({ stage: 'applied', title: 'A' }));
    await POST(makePostRequest({ stage: 'wishlist', title: 'B' }));

    const res = await GET(makeGetRequest());
    const json = await res.json();
    expect(json.jobs.map((j: { stage: string }) => j.stage)).toEqual(['applied', 'wishlist']);
  });
});

describe('POST /api/jobs', () => {
  it('creates a job with the given fields and returns 201', async () => {
    const res = await POST(makePostRequest({ title: 'Engineer', company: 'Acme', location: 'Remote' }));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.job.title).toBe('Engineer');
    expect(json.job.stage).toBe('wishlist');
    expect(json.job.position).toBe(0);
  });

  it('appends position when adding a second job to the same stage', async () => {
    await POST(makePostRequest({ title: 'First' }));
    const res = await POST(makePostRequest({ title: 'Second' }));
    const json = await res.json();
    expect(json.job.position).toBe(1);
  });

  it('returns 400 for an invalid stage', async () => {
    const res = await POST(makePostRequest({ stage: 'not-a-stage', title: 'X' }));
    expect(res.status).toBe(400);
  });
});
