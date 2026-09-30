import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  createDb,
  createUser,
  createJob,
  getJobs,
  getJob,
  updateJob,
  deleteJob,
  getProfile,
  upsertProfile,
  getKit,
  upsertKitField,
  type Db,
} from './db';

let db: Db;
let dbPath: string;
let userId: number;

function cleanupDbFile(p: string) {
  for (const suffix of ['', '-journal', '-wal', '-shm']) {
    fs.rmSync(`${p}${suffix}`, { force: true });
  }
}

beforeEach(() => {
  dbPath = path.join(os.tmpdir(), `job-tracker-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
  db = createDb(dbPath);
  // Create a test user that all tests run as.
  const user = createUser(db, 'test@example.com', 'hash');
  userId = user.id;
});

afterEach(() => {
  db.close();
  cleanupDbFile(dbPath);
});

describe('createJob', () => {
  it('inserts a job at position 0 when its stage is empty', () => {
    const job = createJob(db, userId, {
      title: 'Backend Engineer',
      company: 'Acme',
      location: 'Remote',
      salary: '$150k',
      description: 'Build things.',
      sourceUrl: 'https://acme.example/jobs/1',
      rawInput: 'raw text',
      extraFields: { referral: 'yes' },
    });

    expect(job.id).toBeGreaterThan(0);
    expect(job.stage).toBe('wishlist');
    expect(job.position).toBe(0);
    expect(job.title).toBe('Backend Engineer');
    expect(job.extraFields).toEqual({ referral: 'yes' });
    expect(job.createdAt).toBeTruthy();
    expect(job.updatedAt).toBeTruthy();
  });

  it('appends subsequent jobs in the same stage at the next position', () => {
    createJob(db, userId, { title: 'A', company: null, location: null, salary: null, description: null, sourceUrl: null, rawInput: null });
    const second = createJob(db, userId, { title: 'B', company: null, location: null, salary: null, description: null, sourceUrl: null, rawInput: null });
    expect(second.position).toBe(1);
  });

  it('respects an explicit stage', () => {
    const job = createJob(db, userId, { stage: 'applied', title: 'A', company: null, location: null, salary: null, description: null, sourceUrl: null, rawInput: null });
    expect(job.stage).toBe('applied');
    expect(job.position).toBe(0);
  });

  it('isolates jobs per user — another user cannot see them', () => {
    const other = createUser(db, 'other@example.com', 'hash2');
    createJob(db, userId, { title: 'My Job', company: null, location: null, salary: null, description: null, sourceUrl: null, rawInput: null });
    expect(getJobs(db, other.id)).toHaveLength(0);
  });
});

describe('getJobs', () => {
  it('returns all jobs ordered by stage then position', () => {
    createJob(db, userId, { stage: 'applied', title: 'Applied job', company: null, location: null, salary: null, description: null, sourceUrl: null, rawInput: null });
    createJob(db, userId, { stage: 'wishlist', title: 'Wishlist job', company: null, location: null, salary: null, description: null, sourceUrl: null, rawInput: null });

    const jobs = getJobs(db, userId);
    expect(jobs.map((j) => j.stage)).toEqual(['applied', 'wishlist']);
  });
});

describe('getJob', () => {
  it('returns the matching job', () => {
    const created = createJob(db, userId, { title: 'A', company: null, location: null, salary: null, description: null, sourceUrl: null, rawInput: null });
    const found = getJob(db, userId, created.id);
    expect(found?.id).toBe(created.id);
  });

  it('returns undefined for a missing id', () => {
    expect(getJob(db, userId, 9999)).toBeUndefined();
  });

  it('returns undefined when the job belongs to another user', () => {
    const other = createUser(db, 'other@example.com', 'hash2');
    const job = createJob(db, other.id, { title: 'A', company: null, location: null, salary: null, description: null, sourceUrl: null, rawInput: null });
    expect(getJob(db, userId, job.id)).toBeUndefined();
  });
});

describe('updateJob', () => {
  it('edits plain fields without touching stage or position', () => {
    const job = createJob(db, userId, { title: 'A', company: null, location: null, salary: null, description: null, sourceUrl: null, rawInput: null });
    const updated = updateJob(db, userId, job.id, { title: 'Updated Title', salary: '$200k' });
    expect(updated?.title).toBe('Updated Title');
    expect(updated?.salary).toBe('$200k');
    expect(updated?.stage).toBe('wishlist');
    expect(updated?.position).toBe(0);
  });

  it('returns undefined for a missing id', () => {
    expect(updateJob(db, userId, 9999, { title: 'X' })).toBeUndefined();
  });

  it('renumbers positions when moving a job later within the same stage', () => {
    const a = createJob(db, userId, { title: 'A', company: null, location: null, salary: null, description: null, sourceUrl: null, rawInput: null });
    const b = createJob(db, userId, { title: 'B', company: null, location: null, salary: null, description: null, sourceUrl: null, rawInput: null });
    const c = createJob(db, userId, { title: 'C', company: null, location: null, salary: null, description: null, sourceUrl: null, rawInput: null });

    updateJob(db, userId, a.id, { stage: 'wishlist', position: 2 });

    const jobs = getJobs(db, userId).filter((j) => j.stage === 'wishlist');
    const byId = Object.fromEntries(jobs.map((j) => [j.id, j.position]));
    expect(byId[a.id]).toBe(2);
    expect(byId[b.id]).toBe(0);
    expect(byId[c.id]).toBe(1);
  });

  it('renumbers positions when moving a job earlier within the same stage', () => {
    const a = createJob(db, userId, { title: 'A', company: null, location: null, salary: null, description: null, sourceUrl: null, rawInput: null });
    const b = createJob(db, userId, { title: 'B', company: null, location: null, salary: null, description: null, sourceUrl: null, rawInput: null });
    const c = createJob(db, userId, { title: 'C', company: null, location: null, salary: null, description: null, sourceUrl: null, rawInput: null });

    updateJob(db, userId, c.id, { stage: 'wishlist', position: 0 });

    const jobs = getJobs(db, userId).filter((j) => j.stage === 'wishlist');
    const byId = Object.fromEntries(jobs.map((j) => [j.id, j.position]));
    expect(byId[c.id]).toBe(0);
    expect(byId[a.id]).toBe(1);
    expect(byId[b.id]).toBe(2);
  });

  it('renumbers both stages when moving a job across stages', () => {
    const a = createJob(db, userId, { stage: 'wishlist', title: 'A', company: null, location: null, salary: null, description: null, sourceUrl: null, rawInput: null });
    const b = createJob(db, userId, { stage: 'wishlist', title: 'B', company: null, location: null, salary: null, description: null, sourceUrl: null, rawInput: null });
    const c = createJob(db, userId, { stage: 'applied', title: 'C', company: null, location: null, salary: null, description: null, sourceUrl: null, rawInput: null });

    const moved = updateJob(db, userId, a.id, { stage: 'applied', position: 0 });

    expect(moved?.stage).toBe('applied');
    expect(moved?.position).toBe(0);

    const wishlist = getJobs(db, userId).filter((j) => j.stage === 'wishlist');
    expect(wishlist).toHaveLength(1);
    expect(wishlist[0].id).toBe(b.id);
    expect(wishlist[0].position).toBe(0);

    const applied = getJobs(db, userId).filter((j) => j.stage === 'applied');
    const byId = Object.fromEntries(applied.map((j) => [j.id, j.position]));
    expect(byId[a.id]).toBe(0);
    expect(byId[c.id]).toBe(1);
  });
});

describe('deleteJob', () => {
  it('removes the job', () => {
    const job = createJob(db, userId, { title: 'A', company: null, location: null, salary: null, description: null, sourceUrl: null, rawInput: null });
    deleteJob(db, userId, job.id);
    expect(getJob(db, userId, job.id)).toBeUndefined();
  });

  it('cascades to delete the associated job_kits row', () => {
    const job = createJob(db, userId, { title: 'A', company: null, location: null, salary: null, description: null, sourceUrl: null, rawInput: null });
    db.prepare('INSERT INTO job_kits (job_id) VALUES (?)').run(job.id);

    deleteJob(db, userId, job.id);

    const kitRow = db.prepare('SELECT * FROM job_kits WHERE job_id = ?').get(job.id);
    expect(kitRow).toBeUndefined();
  });
});

describe('getProfile / upsertProfile', () => {
  it('returns undefined before any profile row exists', () => {
    expect(getProfile(db, userId)).toBeUndefined();
  });

  it('creates a profile row on first upsert', () => {
    const profile = upsertProfile(db, userId, { resumeText: 'My resume text', aboutMe: 'I like building things.' });
    expect(profile.id).toBeGreaterThan(0);
    expect(profile.resumeText).toBe('My resume text');
    expect(profile.aboutMe).toBe('I like building things.');
    expect(profile.updatedAt).toBeTruthy();
  });

  it('updates only the fields provided on a later upsert', () => {
    upsertProfile(db, userId, { resumeText: 'Original resume', aboutMe: 'Original about' });
    const updated = upsertProfile(db, userId, { aboutMe: 'Updated about' });
    expect(updated.resumeText).toBe('Original resume');
    expect(updated.aboutMe).toBe('Updated about');
  });

  it('records resume filename and upload timestamp', () => {
    const profile = upsertProfile(db, userId, {
      resumeText: 'Extracted text',
      resumeFilename: 'resume.pdf',
      resumeUploadedAt: '2026-08-15T00:00:00.000Z',
    });
    expect(profile.resumeFilename).toBe('resume.pdf');
    expect(profile.resumeUploadedAt).toBe('2026-08-15T00:00:00.000Z');
  });

  it('isolates profiles per user', () => {
    const other = createUser(db, 'other@example.com', 'hash2');
    upsertProfile(db, userId, { aboutMe: 'My bio' });
    expect(getProfile(db, other.id)).toBeUndefined();
  });
});

describe('getKit / upsertKitField', () => {
  it('returns undefined before any kit row exists for a job', () => {
    const job = createJob(db, userId, { title: 'A', company: null, location: null, salary: null, description: null, sourceUrl: null, rawInput: null });
    expect(getKit(db, userId, job.id)).toBeUndefined();
  });

  it('creates the kit row on first field upsert and sets model_text', () => {
    const job = createJob(db, userId, { title: 'A', company: null, location: null, salary: null, description: null, sourceUrl: null, rawInput: null });
    const kit = upsertKitField(db, userId, { jobId: job.id, field: 'cover_letter', value: 'Dear hiring manager...', model: 'text-model-slug' });
    expect(kit.jobId).toBe(job.id);
    expect(kit.coverLetter).toBe('Dear hiring manager...');
    expect(kit.coverLetterGeneratedAt).toBeTruthy();
    expect(kit.modelText).toBe('text-model-slug');
  });

  it('does not clobber a previously written field when upserting a different field', () => {
    const job = createJob(db, userId, { title: 'A', company: null, location: null, salary: null, description: null, sourceUrl: null, rawInput: null });
    upsertKitField(db, userId, { jobId: job.id, field: 'cover_letter', value: 'Cover letter text', model: 'text-model-slug' });
    const kit = upsertKitField(db, userId, { jobId: job.id, field: 'resume_bullets', value: JSON.stringify(['Led X', 'Built Y']), model: 'text-model-slug' });
    expect(kit.coverLetter).toBe('Cover letter text');
    expect(kit.resumeBullets).toEqual(['Led X', 'Built Y']);
  });

  it('stores company_brief under model_web with parsed sources', () => {
    const job = createJob(db, userId, { title: 'A', company: null, location: null, salary: null, description: null, sourceUrl: null, rawInput: null });
    const kit = upsertKitField(db, userId, {
      jobId: job.id,
      field: 'company_brief',
      value: 'Acme is a company that...',
      model: 'web-model-slug',
      sources: ['https://acme.example/about'],
    });
    expect(kit.companyBrief).toBe('Acme is a company that...');
    expect(kit.modelWeb).toBe('web-model-slug');
    expect(kit.companyBriefSources).toEqual(['https://acme.example/about']);
  });

  it('parses interview_questions back into an array', () => {
    const job = createJob(db, userId, { title: 'A', company: null, location: null, salary: null, description: null, sourceUrl: null, rawInput: null });
    const kit = upsertKitField(db, userId, {
      jobId: job.id,
      field: 'interview_questions',
      value: JSON.stringify(['Q1', 'Q2', 'Q3', 'Q4', 'Q5']),
      model: 'text-model-slug',
    });
    expect(kit.interviewQuestions).toEqual(['Q1', 'Q2', 'Q3', 'Q4', 'Q5']);
  });
});
