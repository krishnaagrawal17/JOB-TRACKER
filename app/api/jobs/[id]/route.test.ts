import fs from 'fs';
import os from 'os';
import path from 'path';
import { NextRequest } from 'next/server';
import { createDb, createJob, upsertKitField, type Db } from '@/lib/db';

let db: Db;
let dbPath: string;

vi.mock('@/lib/db', async () => {
  const actual = await vi.importActual<typeof import('@/lib/db')>('@/lib/db');
  return {
    ...actual,
    getDb: () => db,
  };
});

import { GET, PATCH, DELETE } from './route';

function cleanupDbFile(p: string) {
  for (const suffix of ['', '-journal', '-wal', '-shm']) {
    fs.rmSync(`${p}${suffix}`, { force: true });
  }
}

beforeEach(() => {
  dbPath = path.join(os.tmpdir(), `job-tracker-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
  db = createDb(dbPath);
});

afterEach(() => {
  db.close();
  cleanupDbFile(dbPath);
});

function makeRequest(body?: unknown) {
  return new NextRequest('http://localhost/api/jobs/1', {
    method: body ? 'PATCH' : 'GET',
    body: body ? JSON.stringify(body) : undefined,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
  });
}

function makeParams(id: number | string) {
  return { params: Promise.resolve({ id: String(id) }) };
}

describe('GET /api/jobs/[id]', () => {
  it('returns the job with a null kit when no kit exists', async () => {
    const job = createJob(db, { title: 'A', company: null, location: null, salary: null, description: null, sourceUrl: null, rawInput: null });
    const res = await GET(makeRequest(), makeParams(job.id));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.job.id).toBe(job.id);
    expect(json.kit).toBeNull();
  });

  it('returns the joined kit when one exists', async () => {
    const job = createJob(db, { title: 'A', company: null, location: null, salary: null, description: null, sourceUrl: null, rawInput: null });
    upsertKitField(db, { jobId: job.id, field: 'cover_letter', value: 'Dear hiring manager...', model: 'text-model-slug' });

    const res = await GET(makeRequest(), makeParams(job.id));
    const json = await res.json();
    expect(json.kit.coverLetter).toBe('Dear hiring manager...');
  });

  it('returns 404 for a missing job', async () => {
    const res = await GET(makeRequest(), makeParams(9999));
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/jobs/[id]', () => {
  it('edits plain fields', async () => {
    const job = createJob(db, { title: 'A', company: null, location: null, salary: null, description: null, sourceUrl: null, rawInput: null });
    const res = await PATCH(makeRequest({ title: 'Updated' }), makeParams(job.id));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.job.title).toBe('Updated');
  });

  it('moves a job to a new stage and position, renumbering via lib/db.ts', async () => {
    const a = createJob(db, { stage: 'wishlist', title: 'A', company: null, location: null, salary: null, description: null, sourceUrl: null, rawInput: null });
    createJob(db, { stage: 'applied', title: 'B', company: null, location: null, salary: null, description: null, sourceUrl: null, rawInput: null });

    const res = await PATCH(makeRequest({ stage: 'applied', position: 0 }), makeParams(a.id));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.job.stage).toBe('applied');
    expect(json.job.position).toBe(0);
  });

  it('returns 400 when stage is provided without position', async () => {
    const job = createJob(db, { title: 'A', company: null, location: null, salary: null, description: null, sourceUrl: null, rawInput: null });
    const res = await PATCH(makeRequest({ stage: 'applied' }), makeParams(job.id));
    expect(res.status).toBe(400);
  });

  it('returns 400 for an invalid stage', async () => {
    const job = createJob(db, { title: 'A', company: null, location: null, salary: null, description: null, sourceUrl: null, rawInput: null });
    const res = await PATCH(makeRequest({ stage: 'not-a-stage', position: 0 }), makeParams(job.id));
    expect(res.status).toBe(400);
  });

  it('returns 404 for a missing job', async () => {
    const res = await PATCH(makeRequest({ title: 'X' }), makeParams(9999));
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/jobs/[id]', () => {
  it('deletes the job', async () => {
    const job = createJob(db, { title: 'A', company: null, location: null, salary: null, description: null, sourceUrl: null, rawInput: null });
    const res = await DELETE(makeRequest(), makeParams(job.id));
    expect(res.status).toBe(200);
    const getRes = await GET(makeRequest(), makeParams(job.id));
    expect(getRes.status).toBe(404);
  });

  it('returns 404 for a missing job', async () => {
    const res = await DELETE(makeRequest(), makeParams(9999));
    expect(res.status).toBe(404);
  });
});
