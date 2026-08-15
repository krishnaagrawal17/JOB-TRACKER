import fs from 'fs';
import os from 'os';
import path from 'path';
import { NextRequest } from 'next/server';
import { createDb, createJob, upsertProfile, upsertKitField, type Db } from '@/lib/db';
import { TEXT_MODEL_SLUG, WEB_MODEL_SLUG } from '@/lib/models';

let db: Db;
let dbPath: string;

vi.mock('@/lib/db', async () => {
  const actual = await vi.importActual<typeof import('@/lib/db')>('@/lib/db');
  return {
    ...actual,
    getDb: () => db,
  };
});

vi.mock('@/lib/openrouter', () => ({
  callOpenRouter: vi.fn(),
}));

import { callOpenRouter } from '@/lib/openrouter';
import { POST, PATCH } from './route';

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
  vi.resetAllMocks();
});

function makeRequest() {
  return new NextRequest('http://localhost/api/jobs/1/kit', { method: 'POST' });
}

function makeParams(id: number | string) {
  return { params: Promise.resolve({ id: String(id) }) };
}

function mockAllFourSucceed() {
  vi.mocked(callOpenRouter).mockImplementation(async ({ messages }) => {
    const prompt = messages[0].content;
    if (prompt.includes('Write a tailored, professional cover letter')) {
      return 'Dear hiring manager, I am excited to apply...';
    }
    if (prompt.includes('Rewrite 4-6 resume bullet points')) {
      return JSON.stringify(['Led backend migration to Go', 'Reduced p99 latency by 30%']);
    }
    if (prompt.includes('predict the five interview questions')) {
      return JSON.stringify(['Q1', 'Q2', 'Q3', 'Q4', 'Q5']);
    }
    if (prompt.includes('Write a concise, one-page company brief')) {
      return 'Acme is a fintech company founded in 2015...';
    }
    throw new Error(`unexpected prompt: ${prompt}`);
  });
}

describe('POST /api/jobs/[id]/kit', () => {
  it('returns 404 for a missing job', async () => {
    const res = await POST(makeRequest(), makeParams(9999));
    expect(res.status).toBe(404);
  });

  it('generates and persists all four kit fields when every call succeeds', async () => {
    const job = createJob(db, { title: 'Backend Engineer', company: 'Acme', location: 'Remote', salary: null, description: 'Build things.', sourceUrl: null, rawInput: null });
    upsertProfile(db, { resumeText: 'Jane Doe resume text', aboutMe: 'I like clean APIs.' });
    mockAllFourSucceed();

    const res = await POST(makeRequest(), makeParams(job.id));
    expect(res.status).toBe(200);
    const json = await res.json();

    expect(json.partial).toBe(false);
    expect(json.errors).toEqual({});
    expect(json.kit.coverLetter).toContain('Dear hiring manager');
    expect(json.kit.resumeBullets).toEqual(['Led backend migration to Go', 'Reduced p99 latency by 30%']);
    expect(json.kit.interviewQuestions).toEqual(['Q1', 'Q2', 'Q3', 'Q4', 'Q5']);
    expect(json.kit.companyBrief).toContain('Acme is a fintech company');
    expect(json.kit.modelText).toBe(TEXT_MODEL_SLUG);
    expect(json.kit.modelWeb).toBe(WEB_MODEL_SLUG);
  });

  it('works even when no profile has been set up yet', async () => {
    const job = createJob(db, { title: 'Backend Engineer', company: 'Acme', location: null, salary: null, description: 'Build things.', sourceUrl: null, rawInput: null });
    mockAllFourSucceed();

    const res = await POST(makeRequest(), makeParams(job.id));
    expect(res.status).toBe(200);
  });

  it('persists the three successful fields and reports the one failure when company_brief fails', async () => {
    const job = createJob(db, { title: 'Backend Engineer', company: 'Acme', location: null, salary: null, description: 'Build things.', sourceUrl: null, rawInput: null });
    upsertProfile(db, { resumeText: 'Jane Doe resume text', aboutMe: 'I like clean APIs.' });

    vi.mocked(callOpenRouter).mockImplementation(async ({ messages }) => {
      const prompt = messages[0].content;
      if (prompt.includes('Write a tailored, professional cover letter')) return 'Dear hiring manager...';
      if (prompt.includes('Rewrite 4-6 resume bullet points')) return JSON.stringify(['Bullet one', 'Bullet two']);
      if (prompt.includes('predict the five interview questions')) return JSON.stringify(['Q1', 'Q2', 'Q3', 'Q4', 'Q5']);
      if (prompt.includes('Write a concise, one-page company brief')) throw new Error('web search unavailable');
      throw new Error(`unexpected prompt: ${prompt}`);
    });

    const res = await POST(makeRequest(), makeParams(job.id));
    expect(res.status).toBe(200);
    const json = await res.json();

    expect(json.partial).toBe(true);
    expect(json.errors.company_brief).toBe('web search unavailable');
    expect(json.kit.coverLetter).toBe('Dear hiring manager...');
    expect(json.kit.resumeBullets).toEqual(['Bullet one', 'Bullet two']);
    expect(json.kit.interviewQuestions).toEqual(['Q1', 'Q2', 'Q3', 'Q4', 'Q5']);
    expect(json.kit.companyBrief).toBeNull();
  });

  it('attaches the web plugin only to the company_brief call', async () => {
    const job = createJob(db, { title: 'Backend Engineer', company: 'Acme', location: null, salary: null, description: 'Build things.', sourceUrl: null, rawInput: null });
    mockAllFourSucceed();

    await POST(makeRequest(), makeParams(job.id));

    const calls = vi.mocked(callOpenRouter).mock.calls;
    const briefCall = calls.find(([params]) => params.messages[0].content.includes('Write a concise, one-page company brief'));
    const coverLetterCall = calls.find(([params]) => params.messages[0].content.includes('Write a tailored, professional cover letter'));

    expect(briefCall?.[0].plugins).toEqual([{ id: 'web', max_results: 5 }]);
    expect(coverLetterCall?.[0].plugins).toBeUndefined();
  });

  it('rejects a malformed resume_bullets response (object instead of array) without persisting it', async () => {
    const job = createJob(db, { title: 'Backend Engineer', company: 'Acme', location: null, salary: null, description: 'Build things.', sourceUrl: null, rawInput: null });
    upsertProfile(db, { resumeText: 'Jane Doe resume text', aboutMe: 'I like clean APIs.' });

    vi.mocked(callOpenRouter).mockImplementation(async ({ messages }) => {
      const prompt = messages[0].content;
      if (prompt.includes('Write a tailored, professional cover letter')) return 'Dear hiring manager...';
      if (prompt.includes('Rewrite 4-6 resume bullet points')) return JSON.stringify({ bullets: ['Bullet one', 'Bullet two'] });
      if (prompt.includes('predict the five interview questions')) return JSON.stringify(['Q1', 'Q2', 'Q3', 'Q4', 'Q5']);
      if (prompt.includes('Write a concise, one-page company brief')) return 'Acme is a fintech company...';
      throw new Error(`unexpected prompt: ${prompt}`);
    });

    const res = await POST(makeRequest(), makeParams(job.id));
    expect(res.status).toBe(200);
    const json = await res.json();

    expect(json.partial).toBe(true);
    expect(json.errors.resume_bullets).toBeTruthy();
    expect(typeof json.errors.resume_bullets).toBe('string');
    expect(json.kit.resumeBullets).toBeNull();
    // The other three fields still succeeded and were persisted independently.
    expect(json.kit.coverLetter).toBe('Dear hiring manager...');
    expect(json.kit.interviewQuestions).toEqual(['Q1', 'Q2', 'Q3', 'Q4', 'Q5']);
    expect(json.kit.companyBrief).toBe('Acme is a fintech company...');
  });

  it('rejects a malformed interview_questions response (array of numbers) without persisting it', async () => {
    const job = createJob(db, { title: 'Backend Engineer', company: 'Acme', location: null, salary: null, description: 'Build things.', sourceUrl: null, rawInput: null });
    upsertProfile(db, { resumeText: 'Jane Doe resume text', aboutMe: 'I like clean APIs.' });

    vi.mocked(callOpenRouter).mockImplementation(async ({ messages }) => {
      const prompt = messages[0].content;
      if (prompt.includes('Write a tailored, professional cover letter')) return 'Dear hiring manager...';
      if (prompt.includes('Rewrite 4-6 resume bullet points')) return JSON.stringify(['Bullet one', 'Bullet two']);
      if (prompt.includes('predict the five interview questions')) return JSON.stringify([1, 2, 3, 4, 5]);
      if (prompt.includes('Write a concise, one-page company brief')) return 'Acme is a fintech company...';
      throw new Error(`unexpected prompt: ${prompt}`);
    });

    const res = await POST(makeRequest(), makeParams(job.id));
    expect(res.status).toBe(200);
    const json = await res.json();

    expect(json.partial).toBe(true);
    expect(json.errors.interview_questions).toBeTruthy();
    expect(typeof json.errors.interview_questions).toBe('string');
    expect(json.kit.interviewQuestions).toBeNull();
    // The other three fields still succeeded and were persisted independently.
    expect(json.kit.coverLetter).toBe('Dear hiring manager...');
    expect(json.kit.resumeBullets).toEqual(['Bullet one', 'Bullet two']);
    expect(json.kit.companyBrief).toBe('Acme is a fintech company...');
  });

  it('rejects a resume_bullets response that is not valid JSON at all', async () => {
    const job = createJob(db, { title: 'Backend Engineer', company: 'Acme', location: null, salary: null, description: 'Build things.', sourceUrl: null, rawInput: null });
    upsertProfile(db, { resumeText: 'Jane Doe resume text', aboutMe: 'I like clean APIs.' });

    vi.mocked(callOpenRouter).mockImplementation(async ({ messages }) => {
      const prompt = messages[0].content;
      if (prompt.includes('Write a tailored, professional cover letter')) return 'Dear hiring manager...';
      if (prompt.includes('Rewrite 4-6 resume bullet points')) return '```json\n["Bullet one"]\n```';
      if (prompt.includes('predict the five interview questions')) return JSON.stringify(['Q1', 'Q2', 'Q3', 'Q4', 'Q5']);
      if (prompt.includes('Write a concise, one-page company brief')) return 'Acme is a fintech company...';
      throw new Error(`unexpected prompt: ${prompt}`);
    });

    const res = await POST(makeRequest(), makeParams(job.id));
    expect(res.status).toBe(200);
    const json = await res.json();

    expect(json.partial).toBe(true);
    expect(json.errors.resume_bullets).toBeTruthy();
    expect(json.kit.resumeBullets).toBeNull();
  });
});

describe('PATCH /api/jobs/[id]/kit', () => {
  it('saves an edited plain-text field', async () => {
    const job = createJob(db, { title: 'A', company: null, location: null, salary: null, description: null, sourceUrl: null, rawInput: null });
    const res = await PATCH(
      new NextRequest('http://localhost/api/jobs/1/kit', {
        method: 'PATCH',
        body: JSON.stringify({ field: 'cover_letter', value: 'Edited cover letter text' }),
        headers: { 'Content-Type': 'application/json' },
      }),
      makeParams(job.id)
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.kit.coverLetter).toBe('Edited cover letter text');
  });

  it('saves an edited array field', async () => {
    const job = createJob(db, { title: 'A', company: null, location: null, salary: null, description: null, sourceUrl: null, rawInput: null });
    const res = await PATCH(
      new NextRequest('http://localhost/api/jobs/1/kit', {
        method: 'PATCH',
        body: JSON.stringify({ field: 'resume_bullets', value: ['Edited bullet one', 'Edited bullet two'] }),
        headers: { 'Content-Type': 'application/json' },
      }),
      makeParams(job.id)
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.kit.resumeBullets).toEqual(['Edited bullet one', 'Edited bullet two']);
  });

  it('returns 400 for an unknown field', async () => {
    const job = createJob(db, { title: 'A', company: null, location: null, salary: null, description: null, sourceUrl: null, rawInput: null });
    const res = await PATCH(
      new NextRequest('http://localhost/api/jobs/1/kit', {
        method: 'PATCH',
        body: JSON.stringify({ field: 'not_a_field', value: 'x' }),
        headers: { 'Content-Type': 'application/json' },
      }),
      makeParams(job.id)
    );
    expect(res.status).toBe(400);
  });

  it('returns 404 for a missing job', async () => {
    const res = await PATCH(
      new NextRequest('http://localhost/api/jobs/9999/kit', {
        method: 'PATCH',
        body: JSON.stringify({ field: 'cover_letter', value: 'x' }),
        headers: { 'Content-Type': 'application/json' },
      }),
      makeParams(9999)
    );
    expect(res.status).toBe(404);
  });

  it('returns 400 when value is a string for an array field', async () => {
    const job = createJob(db, { title: 'A', company: null, location: null, salary: null, description: null, sourceUrl: null, rawInput: null });
    const res = await PATCH(
      new NextRequest('http://localhost/api/jobs/1/kit', {
        method: 'PATCH',
        body: JSON.stringify({ field: 'resume_bullets', value: 'not an array' }),
        headers: { 'Content-Type': 'application/json' },
      }),
      makeParams(job.id)
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 when value is an array for a plain-text field', async () => {
    const job = createJob(db, { title: 'A', company: null, location: null, salary: null, description: null, sourceUrl: null, rawInput: null });
    const res = await PATCH(
      new NextRequest('http://localhost/api/jobs/1/kit', {
        method: 'PATCH',
        body: JSON.stringify({ field: 'cover_letter', value: ['a', 'b'] }),
        headers: { 'Content-Type': 'application/json' },
      }),
      makeParams(job.id)
    );
    expect(res.status).toBe(400);
  });

  it('preserves company_brief_sources when the brief is edited (regression: CRITICAL 1)', async () => {
    const job = createJob(db, { title: 'A', company: null, location: null, salary: null, description: null, sourceUrl: null, rawInput: null });
    upsertKitField(db, {
      jobId: job.id,
      field: 'company_brief',
      value: 'Original brief',
      model: WEB_MODEL_SLUG,
      sources: ['https://acme.example/about'],
    });

    const res = await PATCH(
      new NextRequest('http://localhost/api/jobs/1/kit', {
        method: 'PATCH',
        body: JSON.stringify({ field: 'company_brief', value: 'Edited brief' }),
        headers: { 'Content-Type': 'application/json' },
      }),
      makeParams(job.id)
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.kit.companyBrief).toBe('Edited brief');
    expect(json.kit.companyBriefSources).toEqual(['https://acme.example/about']);
  });

  it('does not update <field>_generated_at when a field is edited (regression: IMPORTANT 2)', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2020-01-01T00:00:00.000Z'));
      const job = createJob(db, { title: 'A', company: null, location: null, salary: null, description: null, sourceUrl: null, rawInput: null });
      upsertKitField(db, { jobId: job.id, field: 'cover_letter', value: 'Original', model: TEXT_MODEL_SLUG });

      vi.setSystemTime(new Date('2020-01-02T00:00:00.000Z'));
      const res = await PATCH(
        new NextRequest('http://localhost/api/jobs/1/kit', {
          method: 'PATCH',
          body: JSON.stringify({ field: 'cover_letter', value: 'Edited' }),
          headers: { 'Content-Type': 'application/json' },
        }),
        makeParams(job.id)
      );
      const json = await res.json();
      expect(json.kit.coverLetter).toBe('Edited');
      expect(json.kit.coverLetterGeneratedAt).toBe('2020-01-01T00:00:00.000Z');
    } finally {
      vi.useRealTimers();
    }
  });

  it('preserves the generation-time model slug when a field is later edited (regression: IMPORTANT 6)', async () => {
    const job = createJob(db, { title: 'A', company: null, location: null, salary: null, description: null, sourceUrl: null, rawInput: null });
    upsertKitField(db, { jobId: job.id, field: 'resume_bullets', value: JSON.stringify(['A']), model: TEXT_MODEL_SLUG });

    const res = await PATCH(
      new NextRequest('http://localhost/api/jobs/1/kit', {
        method: 'PATCH',
        body: JSON.stringify({ field: 'resume_bullets', value: ['B', 'C'] }),
        headers: { 'Content-Type': 'application/json' },
      }),
      makeParams(job.id)
    );
    const json = await res.json();
    expect(json.kit.resumeBullets).toEqual(['B', 'C']);
    expect(json.kit.modelText).toBe(TEXT_MODEL_SLUG);
  });
});
