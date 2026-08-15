import Database from 'better-sqlite3';
import path from 'path';
import type { Job, Stage } from './types';

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
