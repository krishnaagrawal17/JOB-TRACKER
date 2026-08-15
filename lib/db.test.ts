import fs from 'fs';
import os from 'os';
import path from 'path';
import { createDb, createJob, getJobs, getJob, updateJob, deleteJob, type Db } from './db';

let db: Db;
let dbPath: string;

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

describe('createJob', () => {
  it('inserts a job at position 0 when its stage is empty', () => {
    const job = createJob(db, {
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
    createJob(db, { title: 'A', company: null, location: null, salary: null, description: null, sourceUrl: null, rawInput: null });
    const second = createJob(db, { title: 'B', company: null, location: null, salary: null, description: null, sourceUrl: null, rawInput: null });
    expect(second.position).toBe(1);
  });

  it('respects an explicit stage', () => {
    const job = createJob(db, { stage: 'applied', title: 'A', company: null, location: null, salary: null, description: null, sourceUrl: null, rawInput: null });
    expect(job.stage).toBe('applied');
    expect(job.position).toBe(0);
  });
});

describe('getJobs', () => {
  it('returns all jobs ordered by stage then position', () => {
    createJob(db, { stage: 'applied', title: 'Applied job', company: null, location: null, salary: null, description: null, sourceUrl: null, rawInput: null });
    createJob(db, { stage: 'wishlist', title: 'Wishlist job', company: null, location: null, salary: null, description: null, sourceUrl: null, rawInput: null });

    const jobs = getJobs(db);
    expect(jobs.map((j) => j.stage)).toEqual(['applied', 'wishlist']);
  });
});

describe('getJob', () => {
  it('returns the matching job', () => {
    const created = createJob(db, { title: 'A', company: null, location: null, salary: null, description: null, sourceUrl: null, rawInput: null });
    const found = getJob(db, created.id);
    expect(found?.id).toBe(created.id);
  });

  it('returns undefined for a missing id', () => {
    expect(getJob(db, 9999)).toBeUndefined();
  });
});

describe('updateJob', () => {
  it('edits plain fields without touching stage or position', () => {
    const job = createJob(db, { title: 'A', company: null, location: null, salary: null, description: null, sourceUrl: null, rawInput: null });
    const updated = updateJob(db, job.id, { title: 'Updated Title', salary: '$200k' });
    expect(updated?.title).toBe('Updated Title');
    expect(updated?.salary).toBe('$200k');
    expect(updated?.stage).toBe('wishlist');
    expect(updated?.position).toBe(0);
  });

  it('returns undefined for a missing id', () => {
    expect(updateJob(db, 9999, { title: 'X' })).toBeUndefined();
  });

  it('renumbers positions when moving a job later within the same stage', () => {
    const a = createJob(db, { title: 'A', company: null, location: null, salary: null, description: null, sourceUrl: null, rawInput: null });
    const b = createJob(db, { title: 'B', company: null, location: null, salary: null, description: null, sourceUrl: null, rawInput: null });
    const c = createJob(db, { title: 'C', company: null, location: null, salary: null, description: null, sourceUrl: null, rawInput: null });

    updateJob(db, a.id, { stage: 'wishlist', position: 2 });

    const jobs = getJobs(db).filter((j) => j.stage === 'wishlist');
    const byId = Object.fromEntries(jobs.map((j) => [j.id, j.position]));
    expect(byId[a.id]).toBe(2);
    expect(byId[b.id]).toBe(0);
    expect(byId[c.id]).toBe(1);
  });

  it('renumbers positions when moving a job earlier within the same stage', () => {
    const a = createJob(db, { title: 'A', company: null, location: null, salary: null, description: null, sourceUrl: null, rawInput: null });
    const b = createJob(db, { title: 'B', company: null, location: null, salary: null, description: null, sourceUrl: null, rawInput: null });
    const c = createJob(db, { title: 'C', company: null, location: null, salary: null, description: null, sourceUrl: null, rawInput: null });

    updateJob(db, c.id, { stage: 'wishlist', position: 0 });

    const jobs = getJobs(db).filter((j) => j.stage === 'wishlist');
    const byId = Object.fromEntries(jobs.map((j) => [j.id, j.position]));
    expect(byId[c.id]).toBe(0);
    expect(byId[a.id]).toBe(1);
    expect(byId[b.id]).toBe(2);
  });

  it('renumbers both stages when moving a job across stages', () => {
    const a = createJob(db, { stage: 'wishlist', title: 'A', company: null, location: null, salary: null, description: null, sourceUrl: null, rawInput: null });
    const b = createJob(db, { stage: 'wishlist', title: 'B', company: null, location: null, salary: null, description: null, sourceUrl: null, rawInput: null });
    const c = createJob(db, { stage: 'applied', title: 'C', company: null, location: null, salary: null, description: null, sourceUrl: null, rawInput: null });

    const moved = updateJob(db, a.id, { stage: 'applied', position: 0 });

    expect(moved?.stage).toBe('applied');
    expect(moved?.position).toBe(0);

    const wishlist = getJobs(db).filter((j) => j.stage === 'wishlist');
    expect(wishlist).toHaveLength(1);
    expect(wishlist[0].id).toBe(b.id);
    expect(wishlist[0].position).toBe(0);

    const applied = getJobs(db).filter((j) => j.stage === 'applied');
    const byId = Object.fromEntries(applied.map((j) => [j.id, j.position]));
    expect(byId[a.id]).toBe(0);
    expect(byId[c.id]).toBe(1);
  });
});

describe('deleteJob', () => {
  it('removes the job', () => {
    const job = createJob(db, { title: 'A', company: null, location: null, salary: null, description: null, sourceUrl: null, rawInput: null });
    deleteJob(db, job.id);
    expect(getJob(db, job.id)).toBeUndefined();
  });

  it('cascades to delete the associated job_kits row', () => {
    const job = createJob(db, { title: 'A', company: null, location: null, salary: null, description: null, sourceUrl: null, rawInput: null });
    db.prepare('INSERT INTO job_kits (job_id) VALUES (?)').run(job.id);

    deleteJob(db, job.id);

    const kitRow = db.prepare('SELECT * FROM job_kits WHERE job_id = ?').get(job.id);
    expect(kitRow).toBeUndefined();
  });
});
