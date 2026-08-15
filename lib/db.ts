import Database from 'better-sqlite3';
import path from 'path';
import type { Job, JobKit, Profile, Stage } from './types';

export type Db = InstanceType<typeof Database>;

const DEFAULT_DB_PATH = path.join(process.cwd(), 'job-tracker.db');

let singleton: Db | null = null;

export function createDb(dbPath: string): Db {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  initSchema(db);
  return db;
}

export function getDb(): Db {
  if (!singleton) {
    singleton = createDb(DEFAULT_DB_PATH);
  }
  return singleton;
}

export function initSchema(db: Db): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS profile (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      resume_text TEXT,
      resume_filename TEXT,
      resume_uploaded_at TEXT,
      about_me TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      stage TEXT NOT NULL DEFAULT 'wishlist'
        CHECK (stage IN ('wishlist','applied','interviewing','offer','rejected')),
      position INTEGER NOT NULL DEFAULT 0,
      title TEXT,
      company TEXT,
      location TEXT,
      salary TEXT,
      description TEXT,
      source_url TEXT,
      raw_input TEXT,
      extra_fields TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS job_kits (
      job_id INTEGER PRIMARY KEY REFERENCES jobs(id) ON DELETE CASCADE,
      cover_letter TEXT,
      cover_letter_generated_at TEXT,
      resume_bullets TEXT,
      resume_bullets_generated_at TEXT,
      interview_questions TEXT,
      interview_questions_generated_at TEXT,
      company_brief TEXT,
      company_brief_generated_at TEXT,
      company_brief_sources TEXT,
      model_text TEXT,
      model_web TEXT
    );
  `);
}

interface JobRow {
  id: number;
  stage: Stage;
  position: number;
  title: string | null;
  company: string | null;
  location: string | null;
  salary: string | null;
  description: string | null;
  source_url: string | null;
  raw_input: string | null;
  extra_fields: string | null;
  created_at: string;
  updated_at: string;
}

function rowToJob(row: JobRow): Job {
  return {
    id: row.id,
    stage: row.stage,
    position: row.position,
    title: row.title,
    company: row.company,
    location: row.location,
    salary: row.salary,
    description: row.description,
    sourceUrl: row.source_url,
    rawInput: row.raw_input,
    extraFields: row.extra_fields ? JSON.parse(row.extra_fields) : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface CreateJobInput {
  stage?: Stage;
  title: string | null;
  company: string | null;
  location: string | null;
  salary: string | null;
  description: string | null;
  sourceUrl: string | null;
  rawInput: string | null;
  extraFields?: Record<string, string> | null;
}

export function createJob(db: Db, input: CreateJobInput): Job {
  const stage = input.stage ?? 'wishlist';
  const now = new Date().toISOString();
  const maxPositionRow = db
    .prepare('SELECT MAX(position) as maxPosition FROM jobs WHERE stage = ?')
    .get(stage) as { maxPosition: number | null };
  const position = maxPositionRow.maxPosition === null ? 0 : maxPositionRow.maxPosition + 1;

  const result = db
    .prepare(
      `INSERT INTO jobs (stage, position, title, company, location, salary, description, source_url, raw_input, extra_fields, created_at, updated_at)
       VALUES (@stage, @position, @title, @company, @location, @salary, @description, @sourceUrl, @rawInput, @extraFields, @now, @now)`
    )
    .run({
      stage,
      position,
      title: input.title,
      company: input.company,
      location: input.location,
      salary: input.salary,
      description: input.description,
      sourceUrl: input.sourceUrl,
      rawInput: input.rawInput,
      extraFields: input.extraFields ? JSON.stringify(input.extraFields) : null,
      now,
    });

  return getJob(db, result.lastInsertRowid as number)!;
}

export function getJobs(db: Db): Job[] {
  const rows = db.prepare('SELECT * FROM jobs ORDER BY stage, position').all() as JobRow[];
  return rows.map(rowToJob);
}

export function getJob(db: Db, id: number): Job | undefined {
  const row = db.prepare('SELECT * FROM jobs WHERE id = ?').get(id) as JobRow | undefined;
  return row ? rowToJob(row) : undefined;
}

export interface UpdateJobInput {
  stage?: Stage;
  position?: number;
  title?: string | null;
  company?: string | null;
  location?: string | null;
  salary?: string | null;
  description?: string | null;
  sourceUrl?: string | null;
  extraFields?: Record<string, string> | null;
}

function moveJob(db: Db, job: Job, newStage: Stage, newPosition: number): void {
  if (job.stage === newStage) {
    if (newPosition === job.position) return;
    if (newPosition > job.position) {
      db.prepare(
        `UPDATE jobs SET position = position - 1
         WHERE stage = @stage AND position > @oldPosition AND position <= @newPosition`
      ).run({ stage: job.stage, oldPosition: job.position, newPosition });
    } else {
      db.prepare(
        `UPDATE jobs SET position = position + 1
         WHERE stage = @stage AND position >= @newPosition AND position < @oldPosition`
      ).run({ stage: job.stage, oldPosition: job.position, newPosition });
    }
    db.prepare('UPDATE jobs SET stage = @stage, position = @position WHERE id = @id').run({
      stage: newStage,
      position: newPosition,
      id: job.id,
    });
    return;
  }

  db.prepare('UPDATE jobs SET position = position - 1 WHERE stage = @stage AND position > @oldPosition').run({
    stage: job.stage,
    oldPosition: job.position,
  });
  db.prepare('UPDATE jobs SET position = position + 1 WHERE stage = @stage AND position >= @newPosition').run({
    stage: newStage,
    newPosition,
  });
  db.prepare('UPDATE jobs SET stage = @stage, position = @position WHERE id = @id').run({
    stage: newStage,
    position: newPosition,
    id: job.id,
  });
}

export function updateJob(db: Db, id: number, input: UpdateJobInput): Job | undefined {
  const existing = getJob(db, id);
  if (!existing) return undefined;

  const txn = db.transaction(() => {
    const isMove = input.stage !== undefined && input.position !== undefined;
    if (isMove) {
      moveJob(db, existing, input.stage as Stage, input.position as number);
    }

    const fieldMap: Record<string, unknown> = {};
    if (input.title !== undefined) fieldMap.title = input.title;
    if (input.company !== undefined) fieldMap.company = input.company;
    if (input.location !== undefined) fieldMap.location = input.location;
    if (input.salary !== undefined) fieldMap.salary = input.salary;
    if (input.description !== undefined) fieldMap.description = input.description;
    if (input.sourceUrl !== undefined) fieldMap.source_url = input.sourceUrl;
    if (input.extraFields !== undefined) {
      fieldMap.extra_fields = input.extraFields ? JSON.stringify(input.extraFields) : null;
    }

    const now = new Date().toISOString();
    const columns = Object.keys(fieldMap);
    if (columns.length > 0) {
      const setClause = columns.map((col) => `${col} = @${col}`).join(', ');
      db.prepare(`UPDATE jobs SET ${setClause}, updated_at = @updatedAt WHERE id = @id`).run({
        ...fieldMap,
        updatedAt: now,
        id,
      });
    } else if (isMove) {
      db.prepare('UPDATE jobs SET updated_at = @updatedAt WHERE id = @id').run({ updatedAt: now, id });
    }
  });

  txn();
  return getJob(db, id);
}

export function deleteJob(db: Db, id: number): void {
  db.prepare('DELETE FROM jobs WHERE id = ?').run(id);
}

interface ProfileRow {
  id: 1;
  resume_text: string | null;
  resume_filename: string | null;
  resume_uploaded_at: string | null;
  about_me: string | null;
  updated_at: string;
}

function rowToProfile(row: ProfileRow): Profile {
  return {
    id: 1,
    resumeText: row.resume_text,
    resumeFilename: row.resume_filename,
    resumeUploadedAt: row.resume_uploaded_at,
    aboutMe: row.about_me,
    updatedAt: row.updated_at,
  };
}

export function getProfile(db: Db): Profile | undefined {
  const row = db.prepare('SELECT * FROM profile WHERE id = 1').get() as ProfileRow | undefined;
  return row ? rowToProfile(row) : undefined;
}

export interface UpsertProfileInput {
  resumeText?: string | null;
  resumeFilename?: string | null;
  resumeUploadedAt?: string | null;
  aboutMe?: string | null;
}

export function upsertProfile(db: Db, input: UpsertProfileInput): Profile {
  const now = new Date().toISOString();
  const existing = getProfile(db);

  if (!existing) {
    db.prepare(
      `INSERT INTO profile (id, resume_text, resume_filename, resume_uploaded_at, about_me, updated_at)
       VALUES (1, @resumeText, @resumeFilename, @resumeUploadedAt, @aboutMe, @now)`
    ).run({
      resumeText: input.resumeText ?? null,
      resumeFilename: input.resumeFilename ?? null,
      resumeUploadedAt: input.resumeUploadedAt ?? null,
      aboutMe: input.aboutMe ?? null,
      now,
    });
  } else {
    const fieldMap: Record<string, unknown> = {};
    if (input.resumeText !== undefined) fieldMap.resume_text = input.resumeText;
    if (input.resumeFilename !== undefined) fieldMap.resume_filename = input.resumeFilename;
    if (input.resumeUploadedAt !== undefined) fieldMap.resume_uploaded_at = input.resumeUploadedAt;
    if (input.aboutMe !== undefined) fieldMap.about_me = input.aboutMe;

    const columns = Object.keys(fieldMap);
    if (columns.length > 0) {
      const setClause = columns.map((col) => `${col} = @${col}`).join(', ');
      db.prepare(`UPDATE profile SET ${setClause}, updated_at = @now WHERE id = 1`).run({ ...fieldMap, now });
    }
  }

  return getProfile(db)!;
}

export type KitField = 'cover_letter' | 'resume_bullets' | 'interview_questions' | 'company_brief';

export interface UpsertKitFieldInput {
  jobId: number;
  field: KitField;
  /** Pre-serialized value: plain text for cover_letter/company_brief, JSON.stringify'd array for resume_bullets/interview_questions. */
  value: string;
  model: string;
  /** Citation URLs — only meaningful when field is 'company_brief'. */
  sources?: string[];
}

interface JobKitRow {
  job_id: number;
  cover_letter: string | null;
  cover_letter_generated_at: string | null;
  resume_bullets: string | null;
  resume_bullets_generated_at: string | null;
  interview_questions: string | null;
  interview_questions_generated_at: string | null;
  company_brief: string | null;
  company_brief_generated_at: string | null;
  company_brief_sources: string | null;
  model_text: string | null;
  model_web: string | null;
}

function rowToJobKit(row: JobKitRow): JobKit {
  return {
    jobId: row.job_id,
    coverLetter: row.cover_letter,
    coverLetterGeneratedAt: row.cover_letter_generated_at,
    resumeBullets: row.resume_bullets ? JSON.parse(row.resume_bullets) : null,
    resumeBulletsGeneratedAt: row.resume_bullets_generated_at,
    interviewQuestions: row.interview_questions ? JSON.parse(row.interview_questions) : null,
    interviewQuestionsGeneratedAt: row.interview_questions_generated_at,
    companyBrief: row.company_brief,
    companyBriefGeneratedAt: row.company_brief_generated_at,
    companyBriefSources: row.company_brief_sources ? JSON.parse(row.company_brief_sources) : null,
    modelText: row.model_text,
    modelWeb: row.model_web,
  };
}

export function getKit(db: Db, jobId: number): JobKit | undefined {
  const row = db.prepare('SELECT * FROM job_kits WHERE job_id = ?').get(jobId) as JobKitRow | undefined;
  return row ? rowToJobKit(row) : undefined;
}

export function upsertKitField(db: Db, input: UpsertKitFieldInput): JobKit {
  db.prepare('INSERT OR IGNORE INTO job_kits (job_id) VALUES (?)').run(input.jobId);

  const now = new Date().toISOString();

  if (input.field === 'company_brief') {
    db.prepare(
      `UPDATE job_kits
       SET company_brief = @value, company_brief_generated_at = @now, company_brief_sources = @sources, model_web = @model
       WHERE job_id = @jobId`
    ).run({
      value: input.value,
      now,
      sources: input.sources ? JSON.stringify(input.sources) : null,
      model: input.model,
      jobId: input.jobId,
    });
  } else {
    const column = input.field;
    db.prepare(
      `UPDATE job_kits SET ${column} = @value, ${column}_generated_at = @now, model_text = @model WHERE job_id = @jobId`
    ).run({ value: input.value, now, model: input.model, jobId: input.jobId });
  }

  return getKit(db, input.jobId)!;
}

export interface EditKitFieldInput {
  jobId: number;
  field: KitField;
  /** Pre-serialized value: plain text for cover_letter/company_brief, JSON.stringify'd array for resume_bullets/interview_questions. */
  value: string;
}

/** Persists a human edit to an already-generated kit field without touching the
 * columns that describe how the content was generated (`<field>_generated_at`,
 * `model_text`/`model_web`, `company_brief_sources`) — those mean "when/how the
 * model produced this" and must not move just because a person edited the text. */
export function editKitField(db: Db, input: EditKitFieldInput): JobKit {
  db.prepare('INSERT OR IGNORE INTO job_kits (job_id) VALUES (?)').run(input.jobId);

  const column = input.field;
  db.prepare(`UPDATE job_kits SET ${column} = @value WHERE job_id = @jobId`).run({
    value: input.value,
    jobId: input.jobId,
  });

  return getKit(db, input.jobId)!;
}
