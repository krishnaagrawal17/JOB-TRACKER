// @vitest-environment node
import fs from 'fs';
import os from 'os';
import path from 'path';
import { NextRequest } from 'next/server';
import { createDb, createUser, getProfile, type Db } from '@/lib/db';

let db: Db;
let dbPath: string;
let userId: number;

vi.mock('@/lib/db', async () => {
  const actual = await vi.importActual<typeof import('@/lib/db')>('@/lib/db');
  return { ...actual, getDb: () => db };
});

vi.mock('@/lib/resumeParse', () => ({
  extractResumeText: vi.fn(),
}));

import { extractResumeText } from '@/lib/resumeParse';
import { POST } from './route';

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
  vi.resetAllMocks();
});

function makeUploadRequest(file: File) {
  const formData = new FormData();
  formData.append('resume', file);
  return new NextRequest('http://localhost/api/profile/resume', {
    method: 'POST',
    body: formData,
    headers: { 'X-User-Id': String(userId) },
  });
}

describe('POST /api/profile/resume', () => {
  it('extracts text and writes it into the profile resume field', async () => {
    vi.mocked(extractResumeText).mockResolvedValue('Extracted resume text');
    const file = new File(['fake pdf bytes'], 'resume.pdf', { type: 'application/pdf' });

    const res = await POST(makeUploadRequest(file));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.profile.resumeText).toBe('Extracted resume text');
    expect(json.profile.resumeFilename).toBe('resume.pdf');
    expect(extractResumeText).toHaveBeenCalledWith(expect.any(Buffer), 'application/pdf');

    const stored = getProfile(db, userId);
    expect(stored?.resumeText).toBe('Extracted resume text');
  });

  it('returns 400 when no file is provided', async () => {
    const formData = new FormData();
    const res = await POST(
      new NextRequest('http://localhost/api/profile/resume', {
        method: 'POST',
        body: formData,
        headers: { 'X-User-Id': String(userId) },
      })
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 for an unsupported file type', async () => {
    const file = new File(['plain text'], 'resume.txt', { type: 'text/plain' });
    const res = await POST(makeUploadRequest(file));
    expect(res.status).toBe(400);
  });

  it('returns 500 with the error message when extraction fails', async () => {
    vi.mocked(extractResumeText).mockRejectedValue(new Error('corrupt PDF'));
    const file = new File(['fake pdf bytes'], 'resume.pdf', { type: 'application/pdf' });

    const res = await POST(makeUploadRequest(file));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('corrupt PDF');
  });
});
