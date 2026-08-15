# Job Application Tracker Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local-only Next.js kanban board where a user adds jobs by URL or pasted text, drags cards through five pipeline stages, and generates a persisted AI "kit" (cover letter, resume bullets, interview questions, company brief) per job via OpenRouter.

**Architecture:** Single Next.js (App Router, TypeScript strict) app backed by a 3-table SQLite database (`better-sqlite3`, no ORM). `lib/db.ts` is the only place that touches the database; `lib/openrouter.ts` is the only place that calls OpenRouter. API routes under `app/api/` are thin orchestrators — validate input, call `lib/` helpers, return JSON. `components/board/`, `components/job-detail/`, and `components/profile/` are presentational/client components that fetch through those routes; no client code touches SQLite or OpenRouter directly.

**Tech Stack:** Next.js 15 (App Router), React 19, TypeScript (strict), Tailwind CSS 3, shadcn/ui (Radix-based primitives), `better-sqlite3`, `@dnd-kit/core` + `@dnd-kit/sortable` + `@dnd-kit/utilities`, `unpdf`, `mammoth`, `jsdom` + `@mozilla/readability`, `html-to-text`, `zod`, Vitest + Testing Library (jsdom, colocated `*.test.ts(x)`).

## Global Constraints

- Local-only: runs via `npm run dev` on `localhost`, single user, no auth, no hosting/deployment config.
- SQLite is the persistence layer (not `localStorage`), file on disk, via `better-sqlite3` with no ORM.
- Exact schema (three tables — copy verbatim in Task 4/5, never rename a column):
  ```sql
  CREATE TABLE profile (
    id INTEGER PRIMARY KEY CHECK (id = 1),   -- single-row table
    resume_text TEXT,
    resume_filename TEXT,
    resume_uploaded_at TEXT,
    about_me TEXT,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    stage TEXT NOT NULL DEFAULT 'wishlist'
      CHECK (stage IN ('wishlist','applied','interviewing','offer','rejected')),
    position INTEGER NOT NULL DEFAULT 0,     -- order within its stage column
    title TEXT,
    company TEXT,
    location TEXT,
    salary TEXT,
    description TEXT,
    source_url TEXT,
    raw_input TEXT,                          -- original pasted/fetched text
    extra_fields TEXT,                       -- JSON blob for open-ended extracted fields
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE job_kits (
    job_id INTEGER PRIMARY KEY REFERENCES jobs(id) ON DELETE CASCADE,
    cover_letter TEXT,
    cover_letter_generated_at TEXT,
    resume_bullets TEXT,                     -- JSON array of strings
    resume_bullets_generated_at TEXT,
    interview_questions TEXT,                -- JSON array of 5 strings
    interview_questions_generated_at TEXT,
    company_brief TEXT,
    company_brief_generated_at TEXT,
    company_brief_sources TEXT,              -- JSON array of citation URLs, if returned
    model_text TEXT,                         -- slug actually used (audit trail)
    model_web TEXT
  );
  ```
- `position` is a simple integer-per-stage counter with server-side renumbering on move inside a single `better-sqlite3` transaction — not fractional indexing.
- No model-picker UI. Default OpenRouter model slugs are hard-coded in `lib/models.ts` as `TEXT_MODEL_SLUG` and `WEB_MODEL_SLUG`. **These slugs are placeholders and MUST be verified against OpenRouter's live `/api/v1/models` list before real use** — sketch2app's `MEMORY.md` documents having caught a wrong slug exactly this way.
- The `:online` web-search plugin is model-agnostic: `plugins: [{ id: 'web', max_results: 5 }]` in the OpenRouter request body, attached only to the company-brief call.
- Generate Kit fires 4 OpenRouter calls via `Promise.allSettled`; one failure must not discard the other three — each field is upserted independently.
- Job deletion is a hard delete with a confirm dialog — no archive state (the Rejected column is the natural soft-archive).
- Resume paste and resume upload feed the same editable `resume_text` field — upload extracts text into it, user can still hand-edit.
- Regenerate re-runs the whole kit at once — no per-section regenerate in v1.
- Dark mode only, no light mode. Exact color tokens (implement as Tailwind theme extension / CSS variables):
  - canvas `#010102` (page background)
  - surface-1 `#0f1011` (cards, panels, columns, dialogs, kit panel)
  - surface-2 `#141516` (hover/lifted state)
  - hairline `#23252a` (1px borders), hairline-strong `#34343a`
  - ink `#f7f8f8` (primary text), ink-muted `#d0d6e0` (secondary/meta), ink-subtle `#8a8f98` (tertiary/placeholder)
  - accent primary `#5e6ad2` (used scarcely — CTA, focus rings, brand mark only, never a background fill), hover `#828fff`, focus `#5e69d1`
  - success `#27a644` (status accent, e.g. an "Offer" badge)
- Typography: Inter (weights 500/600/700) for both display and body text, JetBrains Mono for any monospace use. Scale: headline 28px/600, card-title 22px/500, body 16px/400, body-sm 14px/400, caption 12px/400, button 14px/500. Negative letter-spacing on headings only (~-0.4px to -0.6px); body stays near 0.
- Spacing: 4px base unit — xs 8px, sm 12px, md 16px, lg 24px, xl 32px. Card interior padding 24px (board cards may use a tighter 16px for density).
- Radius: md 8px (buttons/inputs), lg 12px (cards, dialogs, kit panel), pill (status badges only — never pill a button/CTA).
- Elevation: no drop shadows — hierarchy comes from the surface ladder + 1px hairline borders. A 2px lavender focus outline at ~50% opacity marks focused inputs/buttons.
- `.env.local` holds `OPENROUTER_API_KEY` (gitignored, with `.env.local.example` placeholder) — same pattern as sketch2app. The key is read only in `lib/openrouter.ts`, server-side, never sent to the browser.
- `next.config.ts` needs `serverExternalPackages: ['better-sqlite3']` so the native SQLite addon isn't bundled for server routes.
- `app/api/jobs/[id]/route.ts` and `app/api/jobs/[id]/kit/route.ts` need explicit `export const runtime = 'nodejs'` since `better-sqlite3`/`unpdf`/`mammoth` are Node-only.
- All source files live directly under `JOB_TRACKER/` (`app/`, `components/`, `lib/`) — no `src/` directory.
- Vitest with jsdom environment, colocated `*.test.ts`/`*.test.tsx` files, `@/*` path alias to project root.

---

## File Structure

```
JOB_TRACKER/
  app/
    layout.tsx                       # top-nav (Board, Profile), fonts, global shell
    globals.css                      # tailwind + design tokens
    page.tsx                         # Board (default route)
    page.test.tsx
    jobs/
      [id]/
        page.tsx                     # Job detail (fields + Kit panel)
        page.test.tsx
    profile/
      page.tsx                       # Profile (resume + about-me)
      page.test.tsx
    api/
      jobs/
        route.ts                     # GET (list) · POST (create)
        route.test.ts
        extract/
          route.ts                   # POST { url? , text? } -> extracted fields, does NOT persist
          route.test.ts
        [id]/
          route.ts                   # GET (detail incl. kit) · PATCH (edit/move) · DELETE
          route.test.ts
          kit/
            route.ts                 # POST -> runs the 4 OpenRouter calls, persists per-field
            route.test.ts
      profile/
        route.ts                     # GET · PATCH
        route.test.ts
        resume/
          route.ts                   # POST multipart (PDF/DOCX) -> extract -> writes resume_text
          route.test.ts
  components/
    board/
      Column.tsx, Column.test.tsx
      JobCard.tsx, JobCard.test.tsx
      Board.tsx, Board.test.tsx
      AddJobDialog.tsx, AddJobDialog.test.tsx
      ExtractedJobForm.tsx, ExtractedJobForm.test.tsx
    job-detail/
      JobHeader.tsx, JobHeader.test.tsx
      JobDescription.tsx, JobDescription.test.tsx
      KitPanel.tsx, KitPanel.test.tsx
      CoverLetterSection.tsx, CoverLetterSection.test.tsx
      ResumeBulletsSection.tsx, ResumeBulletsSection.test.tsx
      InterviewQuestionsSection.tsx, InterviewQuestionsSection.test.tsx
      CompanyBriefSection.tsx, CompanyBriefSection.test.tsx
    profile/
      ProfileForm.tsx, ProfileForm.test.tsx
      ResumeUpload.tsx, ResumeUpload.test.tsx
    ui/                              # shadcn primitives (generated)
  lib/
    utils.ts                        # cn() helper
    types.ts                        # Job, JobKit, Profile, Stage shared types
    db.ts                           # better-sqlite3 singleton + schema init + typed query functions
    db.test.ts
    openrouter.ts                   # callOpenRouter({ model, messages, plugins?, responseFormat? })
    openrouter.test.ts
    models.ts                       # TEXT_MODEL_SLUG, WEB_MODEL_SLUG
    prompts.ts                      # buildExtractionPrompt, buildCoverLetterPrompt, buildBulletsPrompt, buildQuestionsPrompt, buildCompanyBriefPrompt
    prompts.test.ts
    fetchJob.ts                     # fetchAndExtractText(url), FetchBlockedError
    fetchJob.test.ts
    resumeParse.ts                  # extractPdfText, extractDocxText, extractResumeText
    resumeParse.test.ts
  package.json
  tsconfig.json
  next.config.ts
  tailwind.config.ts
  postcss.config.js
  vitest.config.ts
  vitest.setup.ts
  components.json                   # shadcn/ui config
  .env.local.example
  .gitignore
```

---

### Task 1: Project scaffold (Next.js + TypeScript + Vitest + `cn()`)

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `tailwind.config.ts`, `postcss.config.js`
- Create: `app/layout.tsx`, `app/globals.css`, `app/page.tsx`
- Create: `lib/utils.ts`
- Create: `vitest.config.ts`, `vitest.setup.ts`
- Create: `.env.local.example`
- Modify: `.gitignore`
- Test: `app/page.test.tsx`

**Interfaces:**
- Produces: a running Next.js dev server at `app/page.tsx`; `cn(...inputs: ClassValue[]): string` exported from `lib/utils.ts` (used by every styled component from Task 2 onward); path alias `@/*` -> project root; Tailwind classes available via `tailwind.config.ts` (extended with real tokens in Task 2).

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "job-tracker",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "test": "vitest run"
  },
  "dependencies": {
    "next": "^15.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "clsx": "^2.1.1",
    "tailwind-merge": "^2.5.0"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "@types/node": "^22.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "tailwindcss": "^3.4.0",
    "postcss": "^8.4.0",
    "autoprefixer": "^10.4.0",
    "vitest": "^2.1.0",
    "@vitejs/plugin-react": "^4.3.0",
    "jsdom": "^25.0.0",
    "@testing-library/react": "^16.0.0",
    "@testing-library/jest-dom": "^6.5.0",
    "@testing-library/user-event": "^14.5.0"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: Create `next.config.ts`, `tailwind.config.ts`, `postcss.config.js`**

`next.config.ts`:
```ts
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  serverExternalPackages: ['better-sqlite3'],
};

export default nextConfig;
```

`tailwind.config.ts` (minimal for now; full token set added in Task 2):
```ts
import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {},
  },
  plugins: [],
};

export default config;
```

`postcss.config.js`:
```js
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

- [ ] **Step 4: Create `vitest.config.ts` and `vitest.setup.ts`**

`vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    exclude: ['node_modules/**', '.next/**'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
});
```

`vitest.setup.ts`:
```ts
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 5: Write the failing test for `lib/utils.ts`**

`lib/utils.test.ts`... actually skip a standalone test file for `cn()` (it is a two-line wrapper with no branching logic of its own) and instead prove it through the home page test in Step 6, which is the pattern this plan uses everywhere `cn()` is exercised indirectly through a rendered component's className.

`app/page.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import Home from './page';

describe('Home', () => {
  it('renders the app name', () => {
    render(<Home />);
    expect(screen.getByText('Job Tracker')).toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npx vitest run app/page.test.tsx`
Expected: FAIL — `./page` cannot be found (no `app/page.tsx` yet).

- [ ] **Step 7: Create `lib/utils.ts`**

```ts
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 8: Create `app/globals.css`, `app/layout.tsx`, `app/page.tsx`**

`app/globals.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --color-canvas: #010102;
  --color-ink: #f7f8f8;
}

body {
  background-color: var(--color-canvas);
  color: var(--color-ink);
}
```

`app/layout.tsx` (minimal shell for now; top-nav added in Task 21):
```tsx
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Job Tracker',
  description: 'A personal job application tracker.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased">{children}</body>
    </html>
  );
}
```

`app/page.tsx`:
```tsx
export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center">
      <h1 className="text-2xl font-semibold">Job Tracker</h1>
    </main>
  );
}
```

- [ ] **Step 9: Run test to verify it passes**

Run: `npx vitest run app/page.test.tsx`
Expected: PASS

- [ ] **Step 10: Create `.env.local.example` and append to `.gitignore`**

`.env.local.example`:
```
OPENROUTER_API_KEY=your-openrouter-key-here
```

Append to the existing `.gitignore` (currently `node_modules/`, `dist/`, `.env`, `.DS_Store`) so it also contains:
```
.next
.env.local
*.db
*.db-journal
*.db-wal
*.db-shm
```

- [ ] **Step 11: Install dependencies and manually verify the dev server**

Run: `npm install`
Run: `npx vitest run` (expect the single `app/page.test.tsx` test to pass — "0 tests" is not actually possible once Step 5 exists, but confirm the runner itself boots cleanly with no config errors)
Run: `npx tsc --noEmit`
Expected: clean, no errors.
Run: `npm run dev`
Expected: server starts on `http://localhost:3000`; visiting it shows "Job Tracker" centered on a dark background. Stop the server (Ctrl+C) once confirmed.

- [ ] **Step 12: Commit**

```bash
git add package.json tsconfig.json next.config.ts tailwind.config.ts postcss.config.js \
  app/layout.tsx app/globals.css app/page.tsx app/page.test.tsx \
  lib/utils.ts vitest.config.ts vitest.setup.ts .env.local.example .gitignore
git commit -m "feat(job-tracker): scaffold Next.js app with TypeScript, Tailwind, and Vitest"
```

---

### Task 2: Tailwind theme tokens + shadcn/ui setup

**Files:**
- Modify: `tailwind.config.ts`, `app/globals.css`
- Create: `components.json`
- Create (generated by CLI): `components/ui/button.tsx`, `components/ui/card.tsx`, `components/ui/dialog.tsx`, `components/ui/input.tsx`, `components/ui/textarea.tsx`, `components/ui/badge.tsx`, `components/ui/tabs.tsx`
- Test: `components/ui/button.test.tsx`

**Interfaces:**
- Consumes: `cn()` from `lib/utils.ts` (Task 1) — shadcn primitives call it internally.
- Produces: Tailwind theme colors `bg-canvas`, `bg-surface-1`, `bg-surface-2`, `border-hairline`, `border-hairline-strong`, `text-ink`, `text-ink-muted`, `text-ink-subtle`, `bg-accent`/`text-accent`, `accent-hover`, `accent-focus`, `success`; font family `font-sans` (Inter) and `font-mono` (JetBrains Mono); `Button`, `Card`/`CardHeader`/`CardContent`, `Dialog`/`DialogContent`/`DialogHeader`/`DialogTitle`/`DialogFooter`, `Input`, `Textarea`, `Badge`, `Tabs`/`TabsList`/`TabsTrigger`/`TabsContent` — all imported from `@/components/ui/<name>` in later tasks.

- [ ] **Step 1: Replace `tailwind.config.ts` with the full token set**

```ts
import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        canvas: '#010102',
        'surface-1': '#0f1011',
        'surface-2': '#141516',
        hairline: '#23252a',
        'hairline-strong': '#34343a',
        ink: '#f7f8f8',
        'ink-muted': '#d0d6e0',
        'ink-subtle': '#8a8f98',
        accent: {
          DEFAULT: '#5e6ad2',
          hover: '#828fff',
          focus: '#5e69d1',
        },
        success: '#27a644',
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'sans-serif'],
        mono: ['var(--font-jetbrains-mono)', 'monospace'],
      },
      fontSize: {
        headline: ['28px', { lineHeight: '1.2', fontWeight: '600', letterSpacing: '-0.5px' }],
        'card-title': ['22px', { lineHeight: '1.3', fontWeight: '500', letterSpacing: '-0.4px' }],
        body: ['16px', { lineHeight: '1.5', fontWeight: '400' }],
        'body-sm': ['14px', { lineHeight: '1.5', fontWeight: '400' }],
        caption: ['12px', { lineHeight: '1.4', fontWeight: '400' }],
        button: ['14px', { lineHeight: '1.2', fontWeight: '500' }],
      },
      spacing: {
        xs: '8px',
        sm: '12px',
        md: '16px',
        lg: '24px',
        xl: '32px',
      },
      borderRadius: {
        md: '8px',
        lg: '12px',
      },
    },
  },
  plugins: [],
};

export default config;
```

- [ ] **Step 2: Update `app/globals.css` to define the token CSS variables shadcn expects**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --background: 0 0% 0.4%;
  --foreground: 0 0% 97%;
  --card: 210 4% 6%;
  --card-foreground: 0 0% 97%;
  --popover: 210 4% 6%;
  --popover-foreground: 0 0% 97%;
  --primary: 234 51% 60%;
  --primary-foreground: 0 0% 100%;
  --secondary: 210 3% 8%;
  --secondary-foreground: 0 0% 97%;
  --muted: 210 3% 8%;
  --muted-foreground: 220 14% 83%;
  --accent-color: 210 3% 8%;
  --accent-foreground: 0 0% 97%;
  --destructive: 0 63% 50%;
  --destructive-foreground: 0 0% 97%;
  --border: 228 8% 15%;
  --input: 228 8% 15%;
  --ring: 234 51% 60%;
  --radius: 0.5rem;
}

body {
  background-color: #010102;
  color: #f7f8f8;
}
```

- [ ] **Step 3: Create `components.json`**

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "default",
  "rsc": true,
  "tsx": true,
  "tailwind": {
    "config": "tailwind.config.ts",
    "css": "app/globals.css",
    "baseColor": "slate",
    "cssVariables": true
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils"
  }
}
```

- [ ] **Step 4: Install the shadcn/ui primitives**

Run: `npx shadcn@latest add button card dialog input textarea badge tabs --yes`
Expected: creates `components/ui/{button,card,dialog,input,textarea,badge,tabs}.tsx` (does not overwrite `lib/utils.ts` since it already exists from Task 1 with the same `cn()` contents), and adds `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`, and the relevant `@radix-ui/*` packages to `package.json`.

- [ ] **Step 5: Write the failing smoke test**

`components/ui/button.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import { Button } from '@/components/ui/button';

describe('shadcn Button', () => {
  it('renders its children', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole('button', { name: 'Click me' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Run test to verify it fails or already passes**

Run: `npx vitest run components/ui/button.test.tsx`
Expected: PASS immediately, since the shadcn CLI already generated a working component in Step 4 — for a generated primitive that's the expected outcome; proceed to Step 7 regardless.

- [ ] **Step 7: Run the full suite to confirm nothing regressed**

Run: `npx vitest run`
Expected: PASS (2 tests: `app/page.test.tsx`, `components/ui/button.test.tsx`)

- [ ] **Step 8: Commit**

```bash
git add tailwind.config.ts app/globals.css components.json components/ui package.json package-lock.json
git commit -m "feat(job-tracker): add dark theme tokens and shadcn/ui primitives"
```

---

### Task 3: `lib/types.ts` — shared domain types

**Files:**
- Create: `lib/types.ts`
- Test: `lib/types.test.ts`

**Interfaces:**
- Produces: `type Stage = 'wishlist' | 'applied' | 'interviewing' | 'offer' | 'rejected'`, `STAGES: readonly Stage[]` (in board order), `interface Job`, `interface JobKit`, `interface Profile` — consumed by every later task (`lib/db.ts`, all API routes, all board/job-detail/profile components).

- [ ] **Step 1: Write the failing test**

`lib/types.test.ts`:
```ts
import { STAGES } from './types';

describe('STAGES', () => {
  it('lists the five pipeline stages in board order', () => {
    expect(STAGES).toEqual(['wishlist', 'applied', 'interviewing', 'offer', 'rejected']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/types.test.ts`
Expected: FAIL — `./types` cannot be found.

- [ ] **Step 3: Implement `lib/types.ts`**

```ts
export type Stage = 'wishlist' | 'applied' | 'interviewing' | 'offer' | 'rejected';

export const STAGES: readonly Stage[] = ['wishlist', 'applied', 'interviewing', 'offer', 'rejected'];

export interface Job {
  id: number;
  stage: Stage;
  position: number;
  title: string | null;
  company: string | null;
  location: string | null;
  salary: string | null;
  description: string | null;
  sourceUrl: string | null;
  rawInput: string | null;
  extraFields: Record<string, string> | null;
  createdAt: string;
  updatedAt: string;
}

export interface JobKit {
  jobId: number;
  coverLetter: string | null;
  coverLetterGeneratedAt: string | null;
  resumeBullets: string[] | null;
  resumeBulletsGeneratedAt: string | null;
  interviewQuestions: string[] | null;
  interviewQuestionsGeneratedAt: string | null;
  companyBrief: string | null;
  companyBriefGeneratedAt: string | null;
  companyBriefSources: string[] | null;
  modelText: string | null;
  modelWeb: string | null;
}

export interface Profile {
  id: 1;
  resumeText: string | null;
  resumeFilename: string | null;
  resumeUploadedAt: string | null;
  aboutMe: string | null;
  updatedAt: string;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/types.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/types.ts lib/types.test.ts
git commit -m "feat(job-tracker): add shared domain types"
```

---

### Task 4: `lib/db.ts` part 1 — singleton, schema init, `jobs` queries

**Files:**
- Create: `lib/db.ts`
- Test: `lib/db.test.ts`

**Interfaces:**
- Consumes: `Stage`, `Job` from `lib/types.ts` (Task 3).
- Produces: `type Db` (a `better-sqlite3` database instance), `createDb(dbPath: string): Db`, `getDb(): Db`, `initSchema(db: Db): void`, `interface CreateJobInput`, `createJob(db: Db, input: CreateJobInput): Job`, `getJobs(db: Db): Job[]`, `getJob(db: Db, id: number): Job | undefined`, `interface UpdateJobInput`, `updateJob(db: Db, id: number, input: UpdateJobInput): Job | undefined`, `deleteJob(db: Db, id: number): void`.
- Consumed by: `lib/db.ts` part 2 (Task 5, same file), `app/api/jobs/route.ts` (Task 12), `app/api/jobs/[id]/route.ts` (Task 13), `app/api/jobs/[id]/kit/route.ts` (Task 14).

- [ ] **Step 1: Add the `better-sqlite3` dependency**

Add to `package.json` dependencies: `"better-sqlite3": "^11.3.0"`. Add to devDependencies: `"@types/better-sqlite3": "^7.6.0"`. Run `npm install`.

- [ ] **Step 2: Write the failing tests for schema init and `jobs` queries**

`lib/db.test.ts`:
```ts
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
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run lib/db.test.ts`
Expected: FAIL — `./db` cannot be found.

- [ ] **Step 4: Implement `lib/db.ts` (schema + `jobs` queries)**

```ts
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
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run lib/db.test.ts`
Expected: PASS (13 tests)

- [ ] **Step 6: Commit**

```bash
git add lib/db.ts lib/db.test.ts package.json package-lock.json
git commit -m "feat(job-tracker): add SQLite schema and jobs query functions"
```

---

### Task 5: `lib/db.ts` part 2 — `profile` and `job_kits` queries

**Files:**
- Modify: `lib/db.ts`
- Modify: `lib/db.test.ts`

**Interfaces:**
- Consumes: `Db`, `createDb` from Task 4 (same file); `Profile`, `JobKit` from `lib/types.ts` (Task 3).
- Produces: `interface UpsertProfileInput`, `getProfile(db: Db): Profile | undefined`, `upsertProfile(db: Db, input: UpsertProfileInput): Profile`, `type KitField = 'cover_letter' | 'resume_bullets' | 'interview_questions' | 'company_brief'`, `interface UpsertKitFieldInput`, `getKit(db: Db, jobId: number): JobKit | undefined`, `upsertKitField(db: Db, input: UpsertKitFieldInput): JobKit`.
- Consumed by: `app/api/jobs/[id]/route.ts` (Task 13, for the kit join on detail), `app/api/jobs/[id]/kit/route.ts` (Task 14), `app/api/profile/route.ts` and `app/api/profile/resume/route.ts` (Task 15).

- [ ] **Step 1: Append the failing tests for `profile` and `job_kits` queries**

Append to `lib/db.test.ts` (add these imports to the existing `import { ... } from './db'` line: `getProfile, upsertProfile, getKit, upsertKitField`):

```ts
describe('getProfile / upsertProfile', () => {
  it('returns undefined before any profile row exists', () => {
    expect(getProfile(db)).toBeUndefined();
  });

  it('creates the single profile row on first upsert', () => {
    const profile = upsertProfile(db, { resumeText: 'My resume text', aboutMe: 'I like building things.' });
    expect(profile.id).toBe(1);
    expect(profile.resumeText).toBe('My resume text');
    expect(profile.aboutMe).toBe('I like building things.');
    expect(profile.updatedAt).toBeTruthy();
  });

  it('updates only the fields provided on a later upsert', () => {
    upsertProfile(db, { resumeText: 'Original resume', aboutMe: 'Original about' });
    const updated = upsertProfile(db, { aboutMe: 'Updated about' });
    expect(updated.resumeText).toBe('Original resume');
    expect(updated.aboutMe).toBe('Updated about');
  });

  it('records resume filename and upload timestamp', () => {
    const profile = upsertProfile(db, {
      resumeText: 'Extracted text',
      resumeFilename: 'resume.pdf',
      resumeUploadedAt: '2026-08-15T00:00:00.000Z',
    });
    expect(profile.resumeFilename).toBe('resume.pdf');
    expect(profile.resumeUploadedAt).toBe('2026-08-15T00:00:00.000Z');
  });
});

describe('getKit / upsertKitField', () => {
  it('returns undefined before any kit row exists for a job', () => {
    const job = createJob(db, { title: 'A', company: null, location: null, salary: null, description: null, sourceUrl: null, rawInput: null });
    expect(getKit(db, job.id)).toBeUndefined();
  });

  it('creates the kit row on first field upsert and sets model_text', () => {
    const job = createJob(db, { title: 'A', company: null, location: null, salary: null, description: null, sourceUrl: null, rawInput: null });
    const kit = upsertKitField(db, { jobId: job.id, field: 'cover_letter', value: 'Dear hiring manager...', model: 'text-model-slug' });
    expect(kit.jobId).toBe(job.id);
    expect(kit.coverLetter).toBe('Dear hiring manager...');
    expect(kit.coverLetterGeneratedAt).toBeTruthy();
    expect(kit.modelText).toBe('text-model-slug');
  });

  it('does not clobber a previously written field when upserting a different field', () => {
    const job = createJob(db, { title: 'A', company: null, location: null, salary: null, description: null, sourceUrl: null, rawInput: null });
    upsertKitField(db, { jobId: job.id, field: 'cover_letter', value: 'Cover letter text', model: 'text-model-slug' });
    const kit = upsertKitField(db, { jobId: job.id, field: 'resume_bullets', value: JSON.stringify(['Led X', 'Built Y']), model: 'text-model-slug' });
    expect(kit.coverLetter).toBe('Cover letter text');
    expect(kit.resumeBullets).toEqual(['Led X', 'Built Y']);
  });

  it('stores company_brief under model_web with parsed sources', () => {
    const job = createJob(db, { title: 'A', company: null, location: null, salary: null, description: null, sourceUrl: null, rawInput: null });
    const kit = upsertKitField(db, {
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
    const job = createJob(db, { title: 'A', company: null, location: null, salary: null, description: null, sourceUrl: null, rawInput: null });
    const kit = upsertKitField(db, {
      jobId: job.id,
      field: 'interview_questions',
      value: JSON.stringify(['Q1', 'Q2', 'Q3', 'Q4', 'Q5']),
      model: 'text-model-slug',
    });
    expect(kit.interviewQuestions).toEqual(['Q1', 'Q2', 'Q3', 'Q4', 'Q5']);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/db.test.ts`
Expected: FAIL — `getProfile`, `upsertProfile`, `getKit`, `upsertKitField` are not exported yet.

- [ ] **Step 3: Append the `profile` and `job_kits` query functions to `lib/db.ts`**

Add this import at the top alongside the existing one: change `import type { Job, Stage } from './types';` to `import type { Job, JobKit, Profile, Stage } from './types';`. Then append:

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/db.test.ts`
Expected: PASS (19 tests)

- [ ] **Step 5: Run `tsc --noEmit` to confirm the whole `lib/db.ts` file still type-checks**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add lib/db.ts lib/db.test.ts
git commit -m "feat(job-tracker): add profile and job_kits query functions"
```

---

### Task 6: `lib/openrouter.ts` — OpenRouter client wrapper

**Files:**
- Create: `lib/openrouter.ts`
- Test: `lib/openrouter.test.ts`

**Interfaces:**
- Produces: `interface OpenRouterMessage { role: 'system' | 'user' | 'assistant'; content: string }`, `interface CallOpenRouterParams { model: string; messages: OpenRouterMessage[]; plugins?: { id: string; max_results?: number }[]; responseFormat?: { type: 'json_object' } }`, `callOpenRouter(params: CallOpenRouterParams): Promise<string>` — returns the raw message content string; throws `Error` if `OPENROUTER_API_KEY` is unset, if the HTTP call fails, or if the response has no content.
- Consumed by: `app/api/jobs/extract/route.ts` (Task 11), `app/api/jobs/[id]/kit/route.ts` (Task 14).

This follows sketch2app's `lib/openrouter.ts` shape (key read from `process.env.OPENROUTER_API_KEY`, thrown `Error` with the OpenRouter error message on non-2xx responses, thrown `Error` on empty content) but is generalized from sketch2app's vision-specific `generateCode()` to a plain chat-completion wrapper that also supports the `plugins` array (for the `:online` web-search plugin) and `response_format` (for JSON-mode extraction).

- [ ] **Step 1: Write the failing tests**

`lib/openrouter.test.ts`:
```ts
import { callOpenRouter } from './openrouter';

const originalFetch = global.fetch;
const originalEnv = process.env.OPENROUTER_API_KEY;

afterEach(() => {
  global.fetch = originalFetch;
  process.env.OPENROUTER_API_KEY = originalEnv;
  vi.restoreAllMocks();
});

describe('callOpenRouter', () => {
  it('throws if OPENROUTER_API_KEY is not set', async () => {
    delete process.env.OPENROUTER_API_KEY;
    await expect(
      callOpenRouter({ model: 'test/model', messages: [{ role: 'user', content: 'hi' }] })
    ).rejects.toThrow('OPENROUTER_API_KEY is not set');
  });

  it('sends the correct request shape and returns the content', async () => {
    process.env.OPENROUTER_API_KEY = 'test-key';
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'Generated text' } }] }),
    });
    global.fetch = mockFetch as unknown as typeof fetch;

    const result = await callOpenRouter({
      model: 'test/model',
      messages: [
        { role: 'system', content: 'You are helpful.' },
        { role: 'user', content: 'Write a cover letter.' },
      ],
    });

    expect(result).toBe('Generated text');
    expect(mockFetch).toHaveBeenCalledWith(
      'https://openrouter.ai/api/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-key',
          'Content-Type': 'application/json',
        }),
      })
    );
    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body.model).toBe('test/model');
    expect(body.messages).toEqual([
      { role: 'system', content: 'You are helpful.' },
      { role: 'user', content: 'Write a cover letter.' },
    ]);
    expect(body.plugins).toBeUndefined();
    expect(body.response_format).toBeUndefined();
  });

  it('includes plugins in the request body when provided', async () => {
    process.env.OPENROUTER_API_KEY = 'test-key';
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'Brief text' } }] }),
    });
    global.fetch = mockFetch as unknown as typeof fetch;

    await callOpenRouter({
      model: 'test/web-model',
      messages: [{ role: 'user', content: 'Research this company.' }],
      plugins: [{ id: 'web', max_results: 5 }],
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body.plugins).toEqual([{ id: 'web', max_results: 5 }]);
  });

  it('includes response_format in the request body when provided', async () => {
    process.env.OPENROUTER_API_KEY = 'test-key';
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '{"title":"Engineer"}' } }] }),
    });
    global.fetch = mockFetch as unknown as typeof fetch;

    await callOpenRouter({
      model: 'test/model',
      messages: [{ role: 'user', content: 'Extract fields as JSON.' }],
      responseFormat: { type: 'json_object' },
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body.response_format).toEqual({ type: 'json_object' });
  });

  it('throws with the OpenRouter error message when the HTTP call fails', async () => {
    process.env.OPENROUTER_API_KEY = 'test-key';
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({ error: { message: 'rate limited' } }),
    }) as unknown as typeof fetch;

    await expect(
      callOpenRouter({ model: 'test/model', messages: [{ role: 'user', content: 'hi' }] })
    ).rejects.toThrow('rate limited');
  });

  it('throws if the response has no content', async () => {
    process.env.OPENROUTER_API_KEY = 'test-key';
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [] }),
    }) as unknown as typeof fetch;

    await expect(
      callOpenRouter({ model: 'test/model', messages: [{ role: 'user', content: 'hi' }] })
    ).rejects.toThrow('empty response');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/openrouter.test.ts`
Expected: FAIL — `./openrouter` cannot be found.

- [ ] **Step 3: Implement `lib/openrouter.ts`**

```ts
export interface OpenRouterMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface CallOpenRouterParams {
  model: string;
  messages: OpenRouterMessage[];
  plugins?: { id: string; max_results?: number }[];
  responseFormat?: { type: 'json_object' };
}

export async function callOpenRouter(params: CallOpenRouterParams): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY is not set');
  }

  const body: Record<string, unknown> = {
    model: params.model,
    messages: params.messages,
  };
  if (params.plugins) {
    body.plugins = params.plugins;
  }
  if (params.responseFormat) {
    body.response_format = params.responseFormat;
  }

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errBody = await response.json().catch(() => null);
    const message = errBody?.error?.message ?? `OpenRouter request failed (${response.status})`;
    throw new Error(message);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('OpenRouter returned an empty response');
  }

  return content;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/openrouter.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/openrouter.ts lib/openrouter.test.ts
git commit -m "feat(job-tracker): add OpenRouter client wrapper"
```

---

### Task 7: `lib/models.ts` — model slug constants

**Files:**
- Create: `lib/models.ts`
- Test: `lib/models.test.ts`

**Interfaces:**
- Produces: `TEXT_MODEL_SLUG: string`, `WEB_MODEL_SLUG: string`.
- Consumed by: `app/api/jobs/extract/route.ts` (Task 11, uses `TEXT_MODEL_SLUG`), `app/api/jobs/[id]/kit/route.ts` (Task 14, uses both).

**IMPORTANT — placeholder slugs:** the two string values below are **placeholders**. Per the Global Constraints, they MUST be verified against OpenRouter's live `/api/v1/models` list (and, for `WEB_MODEL_SLUG`, that the `:online`/`web` plugin actually works against it) before the app is used for real generations. sketch2app's `MEMORY.md` documents having shipped a wrong Gemini slug (`google/gemini-3.1-pro` doesn't exist; the live list only had `google/gemini-3.1-pro-preview`) that wasn't caught until a whole-branch review — this is the same category of mistake this step is designed to prevent. Do not skip the verification step in Task 21's manual walkthrough.

- [ ] **Step 1: Write the failing test**

`lib/models.test.ts`:
```ts
import { TEXT_MODEL_SLUG, WEB_MODEL_SLUG } from './models';

describe('model slugs', () => {
  it('exports non-empty slug strings for both the text and web-search models', () => {
    expect(typeof TEXT_MODEL_SLUG).toBe('string');
    expect(TEXT_MODEL_SLUG.length).toBeGreaterThan(0);
    expect(typeof WEB_MODEL_SLUG).toBe('string');
    expect(WEB_MODEL_SLUG.length).toBeGreaterThan(0);
  });

  it('uses the provider/model-name slug convention', () => {
    expect(TEXT_MODEL_SLUG).toContain('/');
    expect(WEB_MODEL_SLUG).toContain('/');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/models.test.ts`
Expected: FAIL — `./models` cannot be found.

- [ ] **Step 3: Implement `lib/models.ts`**

```ts
/**
 * Default OpenRouter model slugs. No model-picker UI in v1 — these are the
 * only two models the app ever calls.
 *
 * PLACEHOLDER SLUGS: verify both of these against OpenRouter's live
 * `/api/v1/models` list before relying on real generations (and confirm the
 * `:online` web-search plugin — `plugins: [{ id: 'web', max_results: 5 }]` —
 * actually works against WEB_MODEL_SLUG). sketch2app's MEMORY.md documents
 * catching a wrong Gemini slug exactly this way; do the same check here
 * before Task 21's manual walkthrough.
 */
export const TEXT_MODEL_SLUG = 'anthropic/claude-sonnet-5';

/** Used only for the company-brief call, with the `web` plugin attached. */
export const WEB_MODEL_SLUG = 'anthropic/claude-sonnet-5';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/models.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/models.ts lib/models.test.ts
git commit -m "feat(job-tracker): add placeholder OpenRouter model slugs"
```

---

### Task 8: `lib/prompts.ts` — prompt builders

**Files:**
- Create: `lib/prompts.ts`
- Test: `lib/prompts.test.ts`

**Interfaces:**
- Consumes: `Job`, `Profile` from `lib/types.ts` (Task 3).
- Produces: `buildExtractionPrompt(rawText: string): string`, `buildCoverLetterPrompt(job: Job, profile: Profile): string`, `buildBulletsPrompt(job: Job, profile: Profile): string`, `buildQuestionsPrompt(job: Job, profile: Profile): string`, `buildCompanyBriefPrompt(job: Job): string`. Each returns the full user-message content string (no separate system message) to be passed as the sole entry in `callOpenRouter`'s `messages` array.
- Consumed by: `app/api/jobs/extract/route.ts` (Task 11, `buildExtractionPrompt`), `app/api/jobs/[id]/kit/route.ts` (Task 14, the other four).

- [ ] **Step 1: Write the failing tests**

`lib/prompts.test.ts`:
```ts
import {
  buildExtractionPrompt,
  buildCoverLetterPrompt,
  buildBulletsPrompt,
  buildQuestionsPrompt,
  buildCompanyBriefPrompt,
} from './prompts';
import type { Job, Profile } from './types';

const job: Job = {
  id: 1,
  stage: 'wishlist',
  position: 0,
  title: 'Senior Backend Engineer',
  company: 'Acme Corp',
  location: 'Remote',
  salary: '$160k-$190k',
  description: 'Own our payments service and mentor junior engineers.',
  sourceUrl: 'https://acme.example/jobs/42',
  rawInput: 'raw posting text',
  extraFields: null,
  createdAt: '2026-08-15T00:00:00.000Z',
  updatedAt: '2026-08-15T00:00:00.000Z',
};

const profile: Profile = {
  id: 1,
  resumeText: 'Jane Doe — 8 years building backend systems in Go and TypeScript.',
  resumeFilename: 'jane-doe-resume.pdf',
  resumeUploadedAt: '2026-08-01T00:00:00.000Z',
  aboutMe: 'I care most about clean APIs and mentoring.',
  updatedAt: '2026-08-01T00:00:00.000Z',
};

describe('buildExtractionPrompt', () => {
  it('includes the raw posting text and asks for JSON output', () => {
    const prompt = buildExtractionPrompt('Senior Backend Engineer at Acme Corp, Remote, $160k-$190k...');
    expect(prompt).toContain('Senior Backend Engineer at Acme Corp, Remote, $160k-$190k...');
    expect(prompt).toContain('JSON');
    expect(prompt).toContain('title');
    expect(prompt).toContain('company');
  });
});

describe('buildCoverLetterPrompt', () => {
  it('includes the job description and the candidate resume/about-me text', () => {
    const prompt = buildCoverLetterPrompt(job, profile);
    expect(prompt).toContain(job.description as string);
    expect(prompt).toContain(job.title as string);
    expect(prompt).toContain(job.company as string);
    expect(prompt).toContain(profile.resumeText as string);
    expect(prompt).toContain(profile.aboutMe as string);
  });
});

describe('buildBulletsPrompt', () => {
  it('includes the job description and resume text', () => {
    const prompt = buildBulletsPrompt(job, profile);
    expect(prompt).toContain(job.description as string);
    expect(prompt).toContain(profile.resumeText as string);
  });
});

describe('buildQuestionsPrompt', () => {
  it('includes the job description, resume text, and asks for five questions', () => {
    const prompt = buildQuestionsPrompt(job, profile);
    expect(prompt).toContain(job.description as string);
    expect(prompt).toContain(profile.resumeText as string);
    expect(prompt).toContain('five');
  });
});

describe('buildCompanyBriefPrompt', () => {
  it('includes the company name and job title, and does not require profile data', () => {
    const prompt = buildCompanyBriefPrompt(job);
    expect(prompt).toContain(job.company as string);
    expect(prompt).toContain(job.title as string);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/prompts.test.ts`
Expected: FAIL — `./prompts` cannot be found.

- [ ] **Step 3: Implement `lib/prompts.ts`**

```ts
import type { Job, Profile } from './types';

export function buildExtractionPrompt(rawText: string): string {
  return `You are helping a job seeker log a job posting into a tracker. Read the job posting text below and extract structured fields as a single JSON object with exactly these keys: "title" (string or null), "company" (string or null), "location" (string or null), "salary" (string or null, keep the original formatting if present), "description" (string — a cleaned-up plain-text summary of the role and requirements, or null), "sourceUrl" (string or null, only if a URL appears in the text), and "extraFields" (an object of any other useful key/value pairs found, such as "employment_type" or "posted_date" — use an empty object {} if none).

Respond with ONLY the JSON object, no explanation, no markdown code fences.

Job posting text:
"""
${rawText}
"""`;
}

export function buildCoverLetterPrompt(job: Job, profile: Profile): string {
  return `Write a tailored, professional cover letter for the job below, written in the voice of the candidate described by the resume and about-me text. Keep it to 3-4 short paragraphs, no placeholder brackets, ready to send.

Job title: ${job.title ?? 'Unknown title'}
Company: ${job.company ?? 'Unknown company'}
Job description:
"""
${job.description ?? ''}
"""

Candidate resume:
"""
${profile.resumeText ?? ''}
"""

Candidate about-me notes:
"""
${profile.aboutMe ?? ''}
"""

Respond with ONLY the cover letter text.`;
}

export function buildBulletsPrompt(job: Job, profile: Profile): string {
  return `Rewrite 4-6 resume bullet points from the candidate's resume below so they're tailored to the job description below — emphasize the experience and skills most relevant to this specific role, using strong action verbs and (where the original resume supports it) quantified impact. Do not invent experience the resume doesn't support.

Job title: ${job.title ?? 'Unknown title'}
Job description:
"""
${job.description ?? ''}
"""

Candidate resume:
"""
${profile.resumeText ?? ''}
"""

Respond with ONLY a JSON array of bullet point strings, no explanation, no markdown code fences.`;
}

export function buildQuestionsPrompt(job: Job, profile: Profile): string {
  return `Based on the job description and the candidate's resume below, predict the five interview questions this candidate is most likely to be asked for this specific role — mix behavioral and technical/role-specific questions.

Job title: ${job.title ?? 'Unknown title'}
Job description:
"""
${job.description ?? ''}
"""

Candidate resume:
"""
${profile.resumeText ?? ''}
"""

Respond with ONLY a JSON array of exactly five question strings, no explanation, no markdown code fences.`;
}

export function buildCompanyBriefPrompt(job: Job): string {
  return `Write a concise, one-page company brief for a candidate about to interview at ${job.company ?? 'this company'}, for the role of ${job.title ?? 'this role'}. Use current, real information about the company — recent news, product focus, size/stage, culture signals, and anything a candidate should know walking into an interview. Do not fabricate facts you can't find; note briefly if something is uncertain.

Respond with ONLY the brief text, written in plain prose with short section headers, no markdown code fences.`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/prompts.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/prompts.ts lib/prompts.test.ts
git commit -m "feat(job-tracker): add extraction and kit-generation prompt builders"
```

---

### Task 9: `lib/fetchJob.ts` — URL fetch + readable-text extraction

**Files:**
- Create: `lib/fetchJob.ts`
- Test: `lib/fetchJob.test.ts`

**Interfaces:**
- Produces: `class FetchBlockedError extends Error`, `fetchAndExtractText(url: string): Promise<string>` — resolves with cleaned readable text, or rejects with a `FetchBlockedError` if the fetch fails/is blocked or no usable text can be extracted.
- Consumed by: `app/api/jobs/extract/route.ts` (Task 11).

- [ ] **Step 1: Add dependencies**

Add to `package.json` dependencies: `"jsdom": "^25.0.0"` (already present as a devDependency from Task 1 for the Vitest environment; add the same version to `dependencies` too since production code now imports it directly), `"@mozilla/readability": "^0.5.0"`, `"html-to-text": "^9.0.5"`. Add to devDependencies: `"@types/html-to-text": "^9.0.4"`. Run `npm install`.

- [ ] **Step 2: Write the failing tests**

`lib/fetchJob.test.ts`:
```ts
import { fetchAndExtractText, FetchBlockedError } from './fetchJob';

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

const ARTICLE_HTML = `
<!DOCTYPE html>
<html>
  <head><title>Senior Backend Engineer at Acme</title></head>
  <body>
    <article>
      <h1>Senior Backend Engineer</h1>
      <p>Acme Corp is looking for a Senior Backend Engineer to join our payments platform team. You will own critical services that process millions of transactions per day, mentor junior engineers, and collaborate closely with product and design.</p>
      <p>We are looking for someone with at least 5 years of experience building distributed backend systems, strong communication skills, and a track record of shipping reliable software at scale. Experience with Go or TypeScript is a strong plus.</p>
      <p>This is a fully remote position with a salary range of $160,000 to $190,000 depending on experience, plus equity and full benefits.</p>
    </article>
  </body>
</html>
`;

const TABLE_LAYOUT_HTML = `
<!DOCTYPE html>
<html>
  <head><title>Job Posting</title></head>
  <body>
    <table>
      <tr><td>Title</td><td>Senior Backend Engineer</td></tr>
      <tr><td>Company</td><td>Acme Corp</td></tr>
      <tr><td>Location</td><td>Remote</td></tr>
      <tr><td>Salary</td><td>$160,000 - $190,000</td></tr>
      <tr><td>Description</td><td>Acme Corp is looking for a Senior Backend Engineer to join our payments platform team. You will own critical services that process millions of transactions per day, mentor junior engineers, and collaborate closely with product and design. We expect at least five years of relevant experience and strong communication skills.</td></tr>
    </table>
  </body>
</html>
`;

describe('fetchAndExtractText', () => {
  it('extracts readable text via Readability from an article-shaped page', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => ARTICLE_HTML,
    }) as unknown as typeof fetch;

    const text = await fetchAndExtractText('https://acme.example/jobs/42');

    expect(text).toContain('Senior Backend Engineer');
    expect(text).toContain('payments platform team');
    expect(text.length).toBeGreaterThan(200);
  });

  it('falls back to html-to-text for a non-article-shaped page', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => TABLE_LAYOUT_HTML,
    }) as unknown as typeof fetch;

    const text = await fetchAndExtractText('https://acme.example/jobs/42');

    expect(text).toContain('Senior Backend Engineer');
    expect(text).toContain('Acme Corp');
    expect(text).toContain('payments platform team');
  });

  it('throws FetchBlockedError when the HTTP response is not ok', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      text: async () => '',
    }) as unknown as typeof fetch;

    await expect(fetchAndExtractText('https://linkedin.example/jobs/1')).rejects.toThrow(FetchBlockedError);
  });

  it('throws FetchBlockedError when fetch itself rejects (network error/timeout)', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('network error')) as unknown as typeof fetch;

    await expect(fetchAndExtractText('https://unreachable.example/jobs/1')).rejects.toThrow(FetchBlockedError);
  });

  it('throws FetchBlockedError when neither Readability nor html-to-text find usable text', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => '<html><body></body></html>',
    }) as unknown as typeof fetch;

    await expect(fetchAndExtractText('https://acme.example/empty')).rejects.toThrow(FetchBlockedError);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run lib/fetchJob.test.ts`
Expected: FAIL — `./fetchJob` cannot be found.

- [ ] **Step 4: Implement `lib/fetchJob.ts`**

```ts
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import { convert } from 'html-to-text';

export class FetchBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FetchBlockedError';
  }
}

const USER_AGENT = 'Mozilla/5.0 (compatible; JobTrackerBot/1.0; +https://localhost)';
const FETCH_TIMEOUT_MS = 10_000;
const MIN_USABLE_LENGTH = 100;

export async function fetchAndExtractText(url: string): Promise<string> {
  const html = await fetchHtml(url);

  const readabilityText = extractWithReadability(html, url);
  if (readabilityText && readabilityText.length >= MIN_USABLE_LENGTH) {
    return readabilityText;
  }

  const fallbackText = extractWithHtmlToText(html);
  if (fallbackText && fallbackText.length >= MIN_USABLE_LENGTH) {
    return fallbackText;
  }

  throw new FetchBlockedError(
    'Could not extract readable text from this page — paste the job description text instead.'
  );
}

async function fetchHtml(url: string): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new FetchBlockedError(
        `Fetching this URL failed (HTTP ${response.status}) — paste the job description text instead.`
      );
    }

    return await response.text();
  } catch (err) {
    if (err instanceof FetchBlockedError) {
      throw err;
    }
    throw new FetchBlockedError('Could not fetch this URL — paste the job description text instead.');
  } finally {
    clearTimeout(timeoutId);
  }
}

function extractWithReadability(html: string, url: string): string | null {
  try {
    const dom = new JSDOM(html, { url });
    const reader = new Readability(dom.window.document);
    const article = reader.parse();
    return article?.textContent?.trim() ?? null;
  } catch {
    return null;
  }
}

function extractWithHtmlToText(html: string): string | null {
  try {
    const text = convert(html, { wordwrap: false }).trim();
    return text.length > 0 ? text : null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run lib/fetchJob.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 6: Commit**

```bash
git add lib/fetchJob.ts lib/fetchJob.test.ts package.json package-lock.json
git commit -m "feat(job-tracker): add URL fetch and readable-text extraction with fallback"
```

---

### Task 10: `lib/resumeParse.ts` — PDF/DOCX text extraction

**Files:**
- Create: `lib/resumeParse.ts`
- Test: `lib/resumeParse.test.ts`

**Interfaces:**
- Produces: `extractPdfText(buffer: Buffer): Promise<string>`, `extractDocxText(buffer: Buffer): Promise<string>`, `extractResumeText(buffer: Buffer, mimeType: string): Promise<string>` (dispatches to one of the two by mimetype; throws `Error` for an unsupported mimetype).
- Consumed by: `app/api/profile/resume/route.ts` (Task 15, via `extractResumeText`).

**Test fixtures:** real PDF/DOCX files aren't checked into the repo. Instead, build tiny valid documents at test time with `pdf-lib` (PDF) and `docx` (DOCX) — both are small, well-maintained libraries purpose-built for generating real, spec-valid documents in code, so the fixtures are guaranteed parseable rather than hand-rolled byte strings that might not satisfy `unpdf`/`mammoth`'s parsers.

- [ ] **Step 1: Add dependencies**

Add to `package.json` dependencies: `"unpdf": "^0.12.0"`, `"mammoth": "^1.8.0"`. Add to devDependencies (test-fixture generation only): `"pdf-lib": "^1.17.1"`, `"docx": "^9.0.0"`. Run `npm install`.

- [ ] **Step 2: Write the failing tests**

`lib/resumeParse.test.ts`:
```ts
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { Document as DocxDocument, Packer, Paragraph, TextRun } from 'docx';
import { extractPdfText, extractDocxText, extractResumeText } from './resumeParse';

async function buildTestPdfBuffer(text: string): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([400, 200]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  page.drawText(text, { x: 20, y: 100, size: 18, font });
  const bytes = await pdfDoc.save();
  return Buffer.from(bytes);
}

async function buildTestDocxBuffer(text: string): Promise<Buffer> {
  const doc = new DocxDocument({
    sections: [
      {
        children: [new Paragraph({ children: [new TextRun(text)] })],
      },
    ],
  });
  return Packer.toBuffer(doc);
}

describe('extractPdfText', () => {
  it('extracts text from a real minimal PDF buffer', async () => {
    const buffer = await buildTestPdfBuffer('Jane Doe Resume Text');
    const text = await extractPdfText(buffer);
    expect(text).toContain('Jane Doe Resume Text');
  });
});

describe('extractDocxText', () => {
  it('extracts text from a real minimal DOCX buffer', async () => {
    const buffer = await buildTestDocxBuffer('Jane Doe Resume Text');
    const text = await extractDocxText(buffer);
    expect(text).toContain('Jane Doe Resume Text');
  });
});

describe('extractResumeText', () => {
  it('dispatches to extractPdfText for application/pdf', async () => {
    const buffer = await buildTestPdfBuffer('PDF dispatch text');
    const text = await extractResumeText(buffer, 'application/pdf');
    expect(text).toContain('PDF dispatch text');
  });

  it('dispatches to extractDocxText for the DOCX mimetype', async () => {
    const buffer = await buildTestDocxBuffer('DOCX dispatch text');
    const text = await extractResumeText(
      buffer,
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    );
    expect(text).toContain('DOCX dispatch text');
  });

  it('throws for an unsupported mimetype', async () => {
    await expect(extractResumeText(Buffer.from('not a resume'), 'text/plain')).rejects.toThrow(
      'Unsupported resume file type'
    );
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run lib/resumeParse.test.ts`
Expected: FAIL — `./resumeParse` cannot be found.

- [ ] **Step 4: Implement `lib/resumeParse.ts`**

```ts
import { extractText, getDocumentProxy } from 'unpdf';
import mammoth from 'mammoth';

const PDF_MIMETYPE = 'application/pdf';
const DOCX_MIMETYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export async function extractPdfText(buffer: Buffer): Promise<string> {
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { text } = await extractText(pdf, { mergePages: true });
  return text.trim();
}

export async function extractDocxText(buffer: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer });
  return result.value.trim();
}

export async function extractResumeText(buffer: Buffer, mimeType: string): Promise<string> {
  if (mimeType === PDF_MIMETYPE) {
    return extractPdfText(buffer);
  }
  if (mimeType === DOCX_MIMETYPE) {
    return extractDocxText(buffer);
  }
  throw new Error(`Unsupported resume file type: ${mimeType}`);
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run lib/resumeParse.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 6: Commit**

```bash
git add lib/resumeParse.ts lib/resumeParse.test.ts package.json package-lock.json
git commit -m "feat(job-tracker): add PDF/DOCX resume text extraction"
```

---

### Task 11: `POST /api/jobs/extract` — fetch/paste, extract, validate (no persistence)

**Files:**
- Modify: `lib/types.ts`, `lib/types.test.ts`
- Create: `app/api/jobs/extract/route.ts`
- Test: `app/api/jobs/extract/route.test.ts`

**Interfaces:**
- Consumes: `fetchAndExtractText`, `FetchBlockedError` from `lib/fetchJob.ts` (Task 9); `callOpenRouter` from `lib/openrouter.ts` (Task 6); `buildExtractionPrompt` from `lib/prompts.ts` (Task 8); `TEXT_MODEL_SLUG` from `lib/models.ts` (Task 7).
- Produces: `ExtractedJobSchema` (zod schema) and `type ExtractedJob` added to `lib/types.ts`; `POST(request: NextRequest): Promise<NextResponse>`. Success: `200 { extracted: ExtractedJob; rawText: string }`. Missing input: `400 { error: string }`. Blocked/failed URL fetch: `422 { error: string; blocked: true }`. Model returned an invalid shape: `502 { error: string }`. Any other failure: `500 { error: string }`. Does **not** write to the database.
- Consumed by: `components/board/AddJobDialog.tsx` (Task 18, via `fetch('/api/jobs/extract', ...)`); `ExtractedJob` type also consumed by `components/board/ExtractedJobForm.tsx` (Task 18).

- [ ] **Step 1: Add the `zod` dependency**

Add to `package.json` dependencies: `"zod": "^3.23.0"`. Run `npm install`.

- [ ] **Step 2: Append the failing test for `ExtractedJobSchema` to `lib/types.test.ts`**

Add `ExtractedJobSchema` to the existing `import { STAGES } from './types';` line (`import { STAGES, ExtractedJobSchema } from './types';`), then append:

```ts
describe('ExtractedJobSchema', () => {
  it('fills in null/empty defaults for missing fields', () => {
    const result = ExtractedJobSchema.parse({ title: 'Engineer' });
    expect(result).toEqual({
      title: 'Engineer',
      company: null,
      location: null,
      salary: null,
      description: null,
      sourceUrl: null,
      extraFields: {},
    });
  });

  it('rejects a wrong-typed field', () => {
    expect(() => ExtractedJobSchema.parse({ title: 12345 })).toThrow();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run lib/types.test.ts`
Expected: FAIL — `ExtractedJobSchema` is not exported yet.

- [ ] **Step 4: Append `ExtractedJobSchema` to `lib/types.ts`**

Add this import at the top: `import { z } from 'zod';`. Then append:

```ts
export const ExtractedJobSchema = z.object({
  title: z.string().nullable().default(null),
  company: z.string().nullable().default(null),
  location: z.string().nullable().default(null),
  salary: z.string().nullable().default(null),
  description: z.string().nullable().default(null),
  sourceUrl: z.string().nullable().default(null),
  extraFields: z.record(z.string()).default({}),
});

export type ExtractedJob = z.infer<typeof ExtractedJobSchema>;
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run lib/types.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 6: Write the failing tests for the route**

`app/api/jobs/extract/route.test.ts`:
```ts
import { NextRequest } from 'next/server';

vi.mock('@/lib/fetchJob', () => ({
  fetchAndExtractText: vi.fn(),
  FetchBlockedError: class FetchBlockedError extends Error {},
}));
vi.mock('@/lib/openrouter', () => ({
  callOpenRouter: vi.fn(),
}));

import { fetchAndExtractText, FetchBlockedError } from '@/lib/fetchJob';
import { callOpenRouter } from '@/lib/openrouter';
import { POST } from './route';

function makeRequest(body: unknown) {
  return new NextRequest('http://localhost/api/jobs/extract', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

afterEach(() => {
  vi.resetAllMocks();
});

describe('POST /api/jobs/extract', () => {
  it('returns 400 when neither url nor text is provided', async () => {
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBeTruthy();
  });

  it('extracts from pasted text without calling fetchAndExtractText', async () => {
    vi.mocked(callOpenRouter).mockResolvedValue(
      JSON.stringify({
        title: 'Engineer',
        company: 'Acme',
        location: 'Remote',
        salary: null,
        description: 'Do stuff.',
        sourceUrl: null,
        extraFields: {},
      })
    );

    const res = await POST(makeRequest({ text: 'Engineer role at Acme, remote, do stuff.' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.extracted.title).toBe('Engineer');
    expect(json.rawText).toBe('Engineer role at Acme, remote, do stuff.');
    expect(fetchAndExtractText).not.toHaveBeenCalled();
  });

  it('fetches and extracts from a url', async () => {
    vi.mocked(fetchAndExtractText).mockResolvedValue('Fetched job posting text.');
    vi.mocked(callOpenRouter).mockResolvedValue(
      JSON.stringify({
        title: 'Engineer',
        company: 'Acme',
        location: null,
        salary: null,
        description: null,
        sourceUrl: null,
        extraFields: {},
      })
    );

    const res = await POST(makeRequest({ url: 'https://acme.example/jobs/1' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.rawText).toBe('Fetched job posting text.');
    expect(fetchAndExtractText).toHaveBeenCalledWith('https://acme.example/jobs/1');
  });

  it('returns 422 with blocked: true when the url fetch is blocked', async () => {
    vi.mocked(fetchAndExtractText).mockRejectedValue(new FetchBlockedError('blocked'));

    const res = await POST(makeRequest({ url: 'https://linkedin.example/jobs/1' }));
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.blocked).toBe(true);
  });

  it('returns 502 when the model response fails schema validation', async () => {
    vi.mocked(callOpenRouter).mockResolvedValue(JSON.stringify({ title: 12345 }));

    const res = await POST(makeRequest({ text: 'Some job text' }));
    expect(res.status).toBe(502);
  });

  it('returns 500 with the error message when callOpenRouter throws', async () => {
    vi.mocked(callOpenRouter).mockRejectedValue(new Error('rate limited'));

    const res = await POST(makeRequest({ text: 'Some job text' }));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('rate limited');
  });
});
```

- [ ] **Step 7: Run tests to verify they fail**

Run: `npx vitest run app/api/jobs/extract/route.test.ts`
Expected: FAIL — `./route` cannot be found.

- [ ] **Step 8: Implement `app/api/jobs/extract/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { fetchAndExtractText, FetchBlockedError } from '@/lib/fetchJob';
import { callOpenRouter } from '@/lib/openrouter';
import { buildExtractionPrompt } from '@/lib/prompts';
import { TEXT_MODEL_SLUG } from '@/lib/models';
import { ExtractedJobSchema } from '@/lib/types';

interface ExtractRequestBody {
  url?: unknown;
  text?: unknown;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = (await request.json()) as ExtractRequestBody;

  const hasUrl = typeof body.url === 'string' && body.url.trim().length > 0;
  const hasText = typeof body.text === 'string' && body.text.trim().length > 0;

  if (!hasUrl && !hasText) {
    return NextResponse.json({ error: 'Provide either a url or text.' }, { status: 400 });
  }

  let rawText: string;
  if (hasUrl) {
    try {
      rawText = await fetchAndExtractText(body.url as string);
    } catch (err) {
      if (err instanceof FetchBlockedError) {
        return NextResponse.json({ error: err.message, blocked: true }, { status: 422 });
      }
      throw err;
    }
  } else {
    rawText = (body.text as string).trim();
  }

  try {
    const content = await callOpenRouter({
      model: TEXT_MODEL_SLUG,
      messages: [{ role: 'user', content: buildExtractionPrompt(rawText) }],
      responseFormat: { type: 'json_object' },
    });

    const parsed = ExtractedJobSchema.safeParse(JSON.parse(content));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Extraction returned an unexpected shape.' }, { status: 502 });
    }

    return NextResponse.json({ extracted: parsed.data, rawText });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Extraction failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

- [ ] **Step 9: Run tests to verify they pass**

Run: `npx vitest run app/api/jobs/extract/route.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 10: Commit**

```bash
git add lib/types.ts lib/types.test.ts app/api/jobs/extract/route.ts app/api/jobs/extract/route.test.ts package.json package-lock.json
git commit -m "feat(job-tracker): add POST /api/jobs/extract route"
```

---

### Task 12: `GET/POST /api/jobs` — list and create

**Files:**
- Create: `app/api/jobs/route.ts`
- Test: `app/api/jobs/route.test.ts`

**Interfaces:**
- Consumes: `getDb`, `createDb`, `getJobs`, `createJob`, `type Db` from `lib/db.ts` (Tasks 4-5); `Stage` from `lib/types.ts` (Task 3).
- Produces: `GET(): Promise<NextResponse>` -> `200 { jobs: Job[] }`. `POST(request: NextRequest): Promise<NextResponse>` -> `201 { job: Job }` on success, `400 { error: string }` for an invalid `stage`.
- Consumed by: `components/board/Board.tsx` (Task 17, `GET`), `components/board/AddJobDialog.tsx` (Task 18, `POST` on confirm).

This establishes the test pattern every later route task reuses: `vi.mock('@/lib/db', ...)` overrides only `getDb` (via `vi.importActual`) so the route runs its real `lib/db.ts` query functions against a temp SQLite file created with `createDb` in `beforeEach`, and cleaned up in `afterEach` — never the real `job-tracker.db`.

- [ ] **Step 1: Write the failing tests**

`app/api/jobs/route.test.ts`:
```ts
import fs from 'fs';
import os from 'os';
import path from 'path';
import { NextRequest } from 'next/server';
import { createDb, type Db } from '@/lib/db';

let db: Db;
let dbPath: string;

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
});

afterEach(() => {
  db.close();
  cleanupDbFile(dbPath);
});

function makeGetRequest() {
  return new NextRequest('http://localhost/api/jobs');
}

function makePostRequest(body: unknown) {
  return new NextRequest('http://localhost/api/jobs', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run app/api/jobs/route.test.ts`
Expected: FAIL — `./route` cannot be found.

- [ ] **Step 3: Implement `app/api/jobs/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { getDb, getJobs, createJob } from '@/lib/db';
import type { Stage } from '@/lib/types';

const VALID_STAGES: Stage[] = ['wishlist', 'applied', 'interviewing', 'offer', 'rejected'];

interface CreateJobRequestBody {
  stage?: unknown;
  title?: unknown;
  company?: unknown;
  location?: unknown;
  salary?: unknown;
  description?: unknown;
  sourceUrl?: unknown;
  rawInput?: unknown;
  extraFields?: unknown;
}

export async function GET(): Promise<NextResponse> {
  const db = getDb();
  const jobs = getJobs(db);
  return NextResponse.json({ jobs });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = (await request.json()) as CreateJobRequestBody;

  if (body.stage !== undefined && !VALID_STAGES.includes(body.stage as Stage)) {
    return NextResponse.json({ error: 'stage must be one of: ' + VALID_STAGES.join(', ') }, { status: 400 });
  }

  const db = getDb();
  const job = createJob(db, {
    stage: body.stage as Stage | undefined,
    title: typeof body.title === 'string' ? body.title : null,
    company: typeof body.company === 'string' ? body.company : null,
    location: typeof body.location === 'string' ? body.location : null,
    salary: typeof body.salary === 'string' ? body.salary : null,
    description: typeof body.description === 'string' ? body.description : null,
    sourceUrl: typeof body.sourceUrl === 'string' ? body.sourceUrl : null,
    rawInput: typeof body.rawInput === 'string' ? body.rawInput : null,
    extraFields: (body.extraFields as Record<string, string> | undefined) ?? null,
  });

  return NextResponse.json({ job }, { status: 201 });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run app/api/jobs/route.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add app/api/jobs/route.ts app/api/jobs/route.test.ts
git commit -m "feat(job-tracker): add GET/POST /api/jobs routes"
```

---

### Task 13: `GET/PATCH/DELETE /api/jobs/[id]` — detail, edit, move, delete

**Files:**
- Create: `app/api/jobs/[id]/route.ts`
- Test: `app/api/jobs/[id]/route.test.ts`

**Interfaces:**
- Consumes: `getDb`, `getJob`, `updateJob`, `deleteJob`, `getKit` from `lib/db.ts` (Tasks 4-5); `Stage` from `lib/types.ts` (Task 3).
- Produces: `GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse>` -> `200 { job: Job; kit: JobKit | null }` or `404 { error: string }`. `PATCH(...): Promise<NextResponse>` -> `200 { job: Job }`, `400` for an invalid id/stage/position, `404` if missing. Moving requires both `stage` and `position` in the same request body — renumbering is delegated entirely to `updateJob` from Task 4 (no renumbering logic here). `DELETE(...): Promise<NextResponse>` -> `200 { success: true }` or `404`.
- Consumed by: `app/jobs/[id]/page.tsx` (Task 19, `GET`), `components/job-detail/*` edit fields (Task 19, `PATCH`), `components/board/Board.tsx`'s `onDragEnd` (Task 17, `PATCH` with `{ stage, position }`), a delete-confirm action in job detail (Task 19, `DELETE`).

- [ ] **Step 1: Write the failing tests**

`app/api/jobs/[id]/route.test.ts`:
```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run app/api/jobs/[id]/route.test.ts`
Expected: FAIL — `./route` cannot be found.

- [ ] **Step 3: Implement `app/api/jobs/[id]/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { getDb, getJob, updateJob, deleteJob, getKit } from '@/lib/db';
import type { Stage } from '@/lib/types';

export const runtime = 'nodejs';

const VALID_STAGES: Stage[] = ['wishlist', 'applied', 'interviewing', 'offer', 'rejected'];

interface RouteParams {
  params: Promise<{ id: string }>;
}

interface PatchRequestBody {
  stage?: unknown;
  position?: unknown;
  title?: unknown;
  company?: unknown;
  location?: unknown;
  salary?: unknown;
  description?: unknown;
  sourceUrl?: unknown;
  extraFields?: unknown;
}

export async function GET(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { id } = await params;
  const jobId = Number(id);
  if (!Number.isInteger(jobId)) {
    return NextResponse.json({ error: 'Invalid job id.' }, { status: 400 });
  }

  const db = getDb();
  const job = getJob(db, jobId);
  if (!job) {
    return NextResponse.json({ error: 'Job not found.' }, { status: 404 });
  }

  const kit = getKit(db, jobId) ?? null;
  return NextResponse.json({ job, kit });
}

export async function PATCH(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { id } = await params;
  const jobId = Number(id);
  if (!Number.isInteger(jobId)) {
    return NextResponse.json({ error: 'Invalid job id.' }, { status: 400 });
  }

  const body = (await request.json()) as PatchRequestBody;

  if (body.stage !== undefined && !VALID_STAGES.includes(body.stage as Stage)) {
    return NextResponse.json({ error: 'stage must be one of: ' + VALID_STAGES.join(', ') }, { status: 400 });
  }
  if (body.stage !== undefined && body.position === undefined) {
    return NextResponse.json({ error: 'position is required when moving stage.' }, { status: 400 });
  }
  if (body.position !== undefined && typeof body.position !== 'number') {
    return NextResponse.json({ error: 'position must be a number.' }, { status: 400 });
  }

  const db = getDb();
  const job = updateJob(db, jobId, {
    stage: body.stage as Stage | undefined,
    position: body.position as number | undefined,
    title: body.title !== undefined ? (body.title as string | null) : undefined,
    company: body.company !== undefined ? (body.company as string | null) : undefined,
    location: body.location !== undefined ? (body.location as string | null) : undefined,
    salary: body.salary !== undefined ? (body.salary as string | null) : undefined,
    description: body.description !== undefined ? (body.description as string | null) : undefined,
    sourceUrl: body.sourceUrl !== undefined ? (body.sourceUrl as string | null) : undefined,
    extraFields: body.extraFields !== undefined ? (body.extraFields as Record<string, string> | null) : undefined,
  });

  if (!job) {
    return NextResponse.json({ error: 'Job not found.' }, { status: 404 });
  }

  return NextResponse.json({ job });
}

export async function DELETE(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { id } = await params;
  const jobId = Number(id);
  if (!Number.isInteger(jobId)) {
    return NextResponse.json({ error: 'Invalid job id.' }, { status: 400 });
  }

  const db = getDb();
  const existing = getJob(db, jobId);
  if (!existing) {
    return NextResponse.json({ error: 'Job not found.' }, { status: 404 });
  }

  deleteJob(db, jobId);
  return NextResponse.json({ success: true });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run app/api/jobs/[id]/route.test.ts`
Expected: PASS (10 tests)

- [ ] **Step 5: Commit**

```bash
git add "app/api/jobs/[id]/route.ts" "app/api/jobs/[id]/route.test.ts"
git commit -m "feat(job-tracker): add job detail/edit/move/delete route"
```

---

### Task 14: `POST /api/jobs/[id]/kit` — Generate/Regenerate Kit

**Files:**
- Create: `app/api/jobs/[id]/kit/route.ts`
- Test: `app/api/jobs/[id]/kit/route.test.ts`

**Interfaces:**
- Consumes: `getDb`, `getJob`, `getProfile`, `upsertKitField`, `getKit`, `type KitField` from `lib/db.ts` (Tasks 4-5); `callOpenRouter` from `lib/openrouter.ts` (Task 6); `buildCoverLetterPrompt`, `buildBulletsPrompt`, `buildQuestionsPrompt`, `buildCompanyBriefPrompt` from `lib/prompts.ts` (Task 8); `TEXT_MODEL_SLUG`, `WEB_MODEL_SLUG` from `lib/models.ts` (Task 7).
- Produces: `POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse>` -> `200 { kit: JobKit | null; partial: boolean; errors: Record<string, string> }` on completion (even partial), `404 { error: string }` if the job doesn't exist.
- Consumed by: `components/job-detail/KitPanel.tsx`'s Generate/Regenerate button (Task 19).

**Implementation note on `company_brief_sources`:** `lib/openrouter.ts`'s `callOpenRouter` (Task 6) returns only the message content string, not the full API response, so citation/annotation metadata from the `web` plugin isn't captured in this phase — `company_brief_sources` is left `null` (the column comment says "if returned", so this is a valid empty state, not a bug). Capturing citations would mean widening `callOpenRouter`'s return type for every caller; deferred as a documented v1 scope decision rather than done here.

- [ ] **Step 1: Write the failing tests**

`app/api/jobs/[id]/kit/route.test.ts`:
```ts
import fs from 'fs';
import os from 'os';
import path from 'path';
import { NextRequest } from 'next/server';
import { createDb, createJob, upsertProfile, type Db } from '@/lib/db';
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
import { POST } from './route';

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
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run "app/api/jobs/[id]/kit/route.test.ts"`
Expected: FAIL — `./route` cannot be found.

- [ ] **Step 3: Implement `app/api/jobs/[id]/kit/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { getDb, getJob, getProfile, upsertKitField, getKit, type KitField } from '@/lib/db';
import { callOpenRouter } from '@/lib/openrouter';
import {
  buildCoverLetterPrompt,
  buildBulletsPrompt,
  buildQuestionsPrompt,
  buildCompanyBriefPrompt,
} from '@/lib/prompts';
import { TEXT_MODEL_SLUG, WEB_MODEL_SLUG } from '@/lib/models';
import type { Profile } from '@/lib/types';

export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { id } = await params;
  const jobId = Number(id);
  if (!Number.isInteger(jobId)) {
    return NextResponse.json({ error: 'Invalid job id.' }, { status: 400 });
  }

  const db = getDb();
  const job = getJob(db, jobId);
  if (!job) {
    return NextResponse.json({ error: 'Job not found.' }, { status: 404 });
  }

  const profile: Profile =
    getProfile(db) ?? {
      id: 1,
      resumeText: null,
      resumeFilename: null,
      resumeUploadedAt: null,
      aboutMe: null,
      updatedAt: new Date().toISOString(),
    };

  const tasks: { field: KitField; run: () => Promise<void> }[] = [
    {
      field: 'cover_letter',
      run: async () => {
        const content = await callOpenRouter({
          model: TEXT_MODEL_SLUG,
          messages: [{ role: 'user', content: buildCoverLetterPrompt(job, profile) }],
        });
        upsertKitField(db, { jobId, field: 'cover_letter', value: content.trim(), model: TEXT_MODEL_SLUG });
      },
    },
    {
      field: 'resume_bullets',
      run: async () => {
        const content = await callOpenRouter({
          model: TEXT_MODEL_SLUG,
          messages: [{ role: 'user', content: buildBulletsPrompt(job, profile) }],
        });
        const bullets = JSON.parse(content) as string[];
        upsertKitField(db, { jobId, field: 'resume_bullets', value: JSON.stringify(bullets), model: TEXT_MODEL_SLUG });
      },
    },
    {
      field: 'interview_questions',
      run: async () => {
        const content = await callOpenRouter({
          model: TEXT_MODEL_SLUG,
          messages: [{ role: 'user', content: buildQuestionsPrompt(job, profile) }],
        });
        const questions = JSON.parse(content) as string[];
        upsertKitField(db, {
          jobId,
          field: 'interview_questions',
          value: JSON.stringify(questions),
          model: TEXT_MODEL_SLUG,
        });
      },
    },
    {
      field: 'company_brief',
      run: async () => {
        const content = await callOpenRouter({
          model: WEB_MODEL_SLUG,
          messages: [{ role: 'user', content: buildCompanyBriefPrompt(job) }],
          plugins: [{ id: 'web', max_results: 5 }],
        });
        // citation metadata isn't exposed by callOpenRouter's string-only return
        // in this phase — see Task 14's implementation note.
        upsertKitField(db, { jobId, field: 'company_brief', value: content.trim(), model: WEB_MODEL_SLUG });
      },
    },
  ];

  const settled = await Promise.allSettled(tasks.map((task) => task.run()));

  const errors: Record<string, string> = {};
  settled.forEach((result, index) => {
    if (result.status === 'rejected') {
      const field = tasks[index].field;
      errors[field] = result.reason instanceof Error ? result.reason.message : 'Generation failed';
    }
  });

  const kit = getKit(db, jobId) ?? null;
  const partial = Object.keys(errors).length > 0;

  return NextResponse.json({ kit, partial, errors });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run "app/api/jobs/[id]/kit/route.test.ts"`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add "app/api/jobs/[id]/kit/route.ts" "app/api/jobs/[id]/kit/route.test.ts"
git commit -m "feat(job-tracker): add Generate/Regenerate Kit route"
```

---

### Task 15: `GET/PATCH /api/profile` and `POST /api/profile/resume`

**Files:**
- Create: `app/api/profile/route.ts`
- Test: `app/api/profile/route.test.ts`
- Create: `app/api/profile/resume/route.ts`
- Test: `app/api/profile/resume/route.test.ts`

**Interfaces:**
- Consumes: `getDb`, `getProfile`, `upsertProfile` from `lib/db.ts` (Task 5); `extractResumeText` from `lib/resumeParse.ts` (Task 10).
- Produces: `GET(): Promise<NextResponse>` -> `200 { profile: Profile | null }`. `PATCH(request: NextRequest): Promise<NextResponse>` -> `200 { profile: Profile }`, `400` for a wrong-typed field. `POST(request: NextRequest): Promise<NextResponse>` (resume route) -> `200 { profile: Profile }`, `400` for a missing/unsupported file, `500` for an extraction failure.
- Consumed by: `components/profile/ProfileForm.tsx` (Task 20, `GET`/`PATCH`), `components/profile/ResumeUpload.tsx` (Task 20, the resume `POST`).

Both routes touch `better-sqlite3` (via `getDb`), and the resume route also touches `unpdf`/`mammoth` — both Node-only, so both get `export const runtime = 'nodejs'`, for the same reason the Global Constraints call it out for the two `jobs/[id]` routes.

- [ ] **Step 1: Write the failing tests for `app/api/profile/route.ts`**

`app/api/profile/route.test.ts`:
```ts
import fs from 'fs';
import os from 'os';
import path from 'path';
import { NextRequest } from 'next/server';
import { createDb, upsertProfile, type Db } from '@/lib/db';

let db: Db;
let dbPath: string;

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
});

afterEach(() => {
  db.close();
  cleanupDbFile(dbPath);
});

function makePatchRequest(body: unknown) {
  return new NextRequest('http://localhost/api/profile', {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('GET /api/profile', () => {
  it('returns null before any profile exists', async () => {
    const res = await GET();
    const json = await res.json();
    expect(json.profile).toBeNull();
  });

  it('returns the stored profile', async () => {
    upsertProfile(db, { resumeText: 'Resume text', aboutMe: 'About me' });
    const res = await GET();
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
    upsertProfile(db, { resumeText: 'Original', aboutMe: 'Original about' });
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/api/profile/route.test.ts`
Expected: FAIL — `./route` cannot be found.

- [ ] **Step 3: Implement `app/api/profile/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { getDb, getProfile, upsertProfile } from '@/lib/db';

export const runtime = 'nodejs';

interface PatchProfileRequestBody {
  resumeText?: unknown;
  aboutMe?: unknown;
}

export async function GET(): Promise<NextResponse> {
  const db = getDb();
  const profile = getProfile(db) ?? null;
  return NextResponse.json({ profile });
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const body = (await request.json()) as PatchProfileRequestBody;

  if (body.resumeText !== undefined && body.resumeText !== null && typeof body.resumeText !== 'string') {
    return NextResponse.json({ error: 'resumeText must be a string or null.' }, { status: 400 });
  }
  if (body.aboutMe !== undefined && body.aboutMe !== null && typeof body.aboutMe !== 'string') {
    return NextResponse.json({ error: 'aboutMe must be a string or null.' }, { status: 400 });
  }

  const db = getDb();
  const profile = upsertProfile(db, {
    resumeText: body.resumeText as string | null | undefined,
    aboutMe: body.aboutMe as string | null | undefined,
  });

  return NextResponse.json({ profile });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/api/profile/route.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Write the failing tests for `app/api/profile/resume/route.ts`**

`app/api/profile/resume/route.test.ts`:
```ts
import fs from 'fs';
import os from 'os';
import path from 'path';
import { NextRequest } from 'next/server';
import { createDb, getProfile, type Db } from '@/lib/db';

let db: Db;
let dbPath: string;

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

    const stored = getProfile(db);
    expect(stored?.resumeText).toBe('Extracted resume text');
  });

  it('returns 400 when no file is provided', async () => {
    const formData = new FormData();
    const res = await POST(
      new NextRequest('http://localhost/api/profile/resume', { method: 'POST', body: formData })
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
```

- [ ] **Step 6: Run tests to verify they fail**

Run: `npx vitest run app/api/profile/resume/route.test.ts`
Expected: FAIL — `./route` cannot be found.

- [ ] **Step 7: Implement `app/api/profile/resume/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { getDb, upsertProfile } from '@/lib/db';
import { extractResumeText } from '@/lib/resumeParse';

export const runtime = 'nodejs';

const SUPPORTED_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

export async function POST(request: NextRequest): Promise<NextResponse> {
  const formData = await request.formData();
  const file = formData.get('resume');

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'resume file is required.' }, { status: 400 });
  }

  if (!SUPPORTED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: 'Only PDF and DOCX resumes are supported.' }, { status: 400 });
  }

  try {
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const resumeText = await extractResumeText(buffer, file.type);

    const db = getDb();
    const profile = upsertProfile(db, {
      resumeText,
      resumeFilename: file.name,
      resumeUploadedAt: new Date().toISOString(),
    });

    return NextResponse.json({ profile });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Resume parsing failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npx vitest run app/api/profile/resume/route.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 9: Commit**

```bash
git add app/api/profile/route.ts app/api/profile/route.test.ts \
  app/api/profile/resume/route.ts app/api/profile/resume/route.test.ts
git commit -m "feat(job-tracker): add profile read/update and resume upload routes"
```

---

### Task 16: `components/board/JobCard.tsx` and `components/board/Column.tsx`

**Files:**
- Create: `components/board/JobCard.tsx`
- Test: `components/board/JobCard.test.tsx`
- Create: `components/board/Column.tsx`
- Test: `components/board/Column.test.tsx`

**Interfaces:**
- Consumes: `Job`, `Stage` from `lib/types.ts` (Task 3); `cn()` from `lib/utils.ts` (Task 1).
- Produces: `JobCard`, props `{ job: Job; onClick?: () => void; className?: string }`. `Column`, props `{ stage: Stage; jobs: Job[]; onJobClick: (job: Job) => void }`. Both are purely presentational — no data fetching, no drag-and-drop wiring (that's Task 17's job, in `Board.tsx`, which wraps these).
- Consumed by: `components/board/Board.tsx` (Task 17).

- [ ] **Step 1: Write the failing tests for `JobCard`**

`components/board/JobCard.test.tsx`:
```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import JobCard from './JobCard';
import type { Job } from '@/lib/types';

const job: Job = {
  id: 1,
  stage: 'wishlist',
  position: 0,
  title: 'Senior Backend Engineer',
  company: 'Acme Corp',
  location: 'Remote',
  salary: '$160k-$190k',
  description: 'Build things.',
  sourceUrl: null,
  rawInput: null,
  extraFields: null,
  createdAt: '2026-08-15T00:00:00.000Z',
  updatedAt: '2026-08-15T00:00:00.000Z',
};

describe('JobCard', () => {
  it('renders the title, company, location, and salary', () => {
    render(<JobCard job={job} />);
    expect(screen.getByText('Senior Backend Engineer')).toBeInTheDocument();
    expect(screen.getByText('Acme Corp')).toBeInTheDocument();
    expect(screen.getByText('Remote')).toBeInTheDocument();
    expect(screen.getByText('$160k-$190k')).toBeInTheDocument();
  });

  it('calls onClick when clicked', () => {
    const onClick = vi.fn();
    render(<JobCard job={job} onClick={onClick} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalled();
  });

  it('falls back to "Untitled role" when title is null', () => {
    render(<JobCard job={{ ...job, title: null }} />);
    expect(screen.getByText('Untitled role')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run components/board/JobCard.test.tsx`
Expected: FAIL — `./JobCard` cannot be found.

- [ ] **Step 3: Implement `components/board/JobCard.tsx`**

```tsx
import type { Job } from '@/lib/types';
import { cn } from '@/lib/utils';

interface JobCardProps {
  job: Job;
  onClick?: () => void;
  className?: string;
}

export default function JobCard({ job, onClick, className }: JobCardProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onClick?.();
      }}
      className={cn(
        'cursor-pointer rounded-lg border border-hairline bg-surface-1 p-md text-left transition-colors hover:bg-surface-2',
        className
      )}
    >
      <h3 className="text-card-title text-ink">{job.title ?? 'Untitled role'}</h3>
      {job.company && <p className="text-body-sm text-ink-muted">{job.company}</p>}
      <div className="mt-xs flex flex-wrap gap-xs text-caption text-ink-subtle">
        {job.location && <span>{job.location}</span>}
        {job.salary && <span>{job.salary}</span>}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run components/board/JobCard.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Write the failing tests for `Column`**

`components/board/Column.test.tsx`:
```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import Column from './Column';
import type { Job } from '@/lib/types';

function makeJob(overrides: Partial<Job>): Job {
  return {
    id: 1,
    stage: 'wishlist',
    position: 0,
    title: 'Engineer',
    company: 'Acme',
    location: null,
    salary: null,
    description: null,
    sourceUrl: null,
    rawInput: null,
    extraFields: null,
    createdAt: '2026-08-15T00:00:00.000Z',
    updatedAt: '2026-08-15T00:00:00.000Z',
    ...overrides,
  };
}

describe('Column', () => {
  it('renders the stage label and job count', () => {
    render(<Column stage="applied" jobs={[makeJob({ id: 1 }), makeJob({ id: 2 })]} onJobClick={() => {}} />);
    expect(screen.getByText('Applied')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('renders zero for an empty column', () => {
    render(<Column stage="offer" jobs={[]} onJobClick={() => {}} />);
    expect(screen.getByText('Offer')).toBeInTheDocument();
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it('renders a JobCard per job and forwards clicks with the right job', () => {
    const onJobClick = vi.fn();
    const jobA = makeJob({ id: 1, title: 'Job A' });
    const jobB = makeJob({ id: 2, title: 'Job B' });
    render(<Column stage="wishlist" jobs={[jobA, jobB]} onJobClick={onJobClick} />);

    fireEvent.click(screen.getByText('Job B'));
    expect(onJobClick).toHaveBeenCalledWith(jobB);
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npx vitest run components/board/Column.test.tsx`
Expected: FAIL — `./Column` cannot be found.

- [ ] **Step 7: Implement `components/board/Column.tsx`**

```tsx
import type { Job, Stage } from '@/lib/types';
import JobCard from './JobCard';

const STAGE_LABELS: Record<Stage, string> = {
  wishlist: 'Wishlist',
  applied: 'Applied',
  interviewing: 'Interviewing',
  offer: 'Offer',
  rejected: 'Rejected',
};

interface ColumnProps {
  stage: Stage;
  jobs: Job[];
  onJobClick: (job: Job) => void;
}

export default function Column({ stage, jobs, onJobClick }: ColumnProps) {
  return (
    <div className="flex w-72 flex-shrink-0 flex-col rounded-lg border border-hairline bg-surface-1 p-sm">
      <div className="mb-sm flex items-center justify-between px-xs">
        <h2 className="text-body font-medium text-ink">{STAGE_LABELS[stage]}</h2>
        <span className="rounded-full bg-surface-2 px-xs py-0.5 text-caption text-ink-muted">{jobs.length}</span>
      </div>
      <div className="flex flex-col gap-xs">
        {jobs.map((job) => (
          <JobCard key={job.id} job={job} onClick={() => onJobClick(job)} />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npx vitest run components/board/Column.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 9: Commit**

```bash
git add components/board/JobCard.tsx components/board/JobCard.test.tsx \
  components/board/Column.tsx components/board/Column.test.tsx
git commit -m "feat(job-tracker): add presentational JobCard and Column components"
```

---

### Task 17: `components/board/Board.tsx` — dnd-kit wiring, fetch, optimistic move

**Files:**
- Modify: `components/board/Column.tsx`, `components/board/Column.test.tsx`
- Create: `components/board/Board.tsx`
- Test: `components/board/Board.test.tsx`

**Interfaces:**
- Consumes: `Column` (extended below) and `JobCard` from Task 16; `STAGES`, `Job`, `Stage` from `lib/types.ts` (Task 3); `GET /api/jobs` (Task 12) and `PATCH /api/jobs/[id]` (Task 13) via `fetch`.
- Produces: `moveJobOptimistically(jobs: Job[], jobId: number, newStage: Stage, newPosition: number): Job[]` (pure, unit-testable); `Board`, props `{ onJobClick: (job: Job) => void }` — fetches `GET /api/jobs` on mount, renders one `Column` per `Stage` inside a `DndContext`, and on `onDragEnd` optimistically updates local state then `PATCH`es the move, rolling back on failure.
- Consumed by: `app/page.tsx` (Task 21).

Column stays presentational, but needs one small extension: dnd-kit's `useSortable` hook must be called per-card so each card is individually draggable, and `Column` is the component that maps over jobs to render each card — so `Column` gains an optional `renderJob` override that `Board` uses to swap in a drag-enabled wrapper around `JobCard`, without `Column` needing to know anything about dnd-kit itself.

- [ ] **Step 1: Add the dnd-kit dependencies**

Add to `package.json` dependencies: `"@dnd-kit/core": "^6.1.0"`, `"@dnd-kit/sortable": "^8.0.0"`, `"@dnd-kit/utilities": "^3.2.2"`. Run `npm install`.

- [ ] **Step 2: Write the failing test for `Column`'s new `renderJob` prop**

Append to `components/board/Column.test.tsx`:

```tsx
describe('Column renderJob override', () => {
  it('uses renderJob instead of the default JobCard when provided', () => {
    const job = makeJob({ id: 1, title: 'Custom Rendered Job' });
    render(
      <Column
        stage="wishlist"
        jobs={[job]}
        onJobClick={() => {}}
        renderJob={(j) => <div>Custom wrapper for {j.title}</div>}
      />
    );
    expect(screen.getByText('Custom wrapper for Custom Rendered Job')).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run components/board/Column.test.tsx`
Expected: FAIL — `Column` doesn't accept a `renderJob` prop yet (existing 4 tests still pass; the new one fails).

- [ ] **Step 4: Add `renderJob` to `components/board/Column.tsx`**

Replace the file's contents:

```tsx
import type { Job, Stage } from '@/lib/types';
import JobCard from './JobCard';

const STAGE_LABELS: Record<Stage, string> = {
  wishlist: 'Wishlist',
  applied: 'Applied',
  interviewing: 'Interviewing',
  offer: 'Offer',
  rejected: 'Rejected',
};

interface ColumnProps {
  stage: Stage;
  jobs: Job[];
  onJobClick: (job: Job) => void;
  renderJob?: (job: Job) => React.ReactNode;
}

export default function Column({ stage, jobs, onJobClick, renderJob }: ColumnProps) {
  return (
    <div className="flex w-72 flex-shrink-0 flex-col rounded-lg border border-hairline bg-surface-1 p-sm">
      <div className="mb-sm flex items-center justify-between px-xs">
        <h2 className="text-body font-medium text-ink">{STAGE_LABELS[stage]}</h2>
        <span className="rounded-full bg-surface-2 px-xs py-0.5 text-caption text-ink-muted">{jobs.length}</span>
      </div>
      <div className="flex flex-col gap-xs">
        {jobs.map((job) => (
          <div key={job.id}>{renderJob ? renderJob(job) : <JobCard job={job} onClick={() => onJobClick(job)} />}</div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run components/board/Column.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 6: Write the failing tests for `Board`**

`components/board/Board.test.tsx`:
```tsx
import { render, screen, waitFor } from '@testing-library/react';
import Board, { moveJobOptimistically } from './Board';
import type { Job } from '@/lib/types';

let capturedOnDragEnd: ((event: { active: { id: number }; over: { id: string | number } | null }) => void) | undefined;

vi.mock('@dnd-kit/core', async () => {
  const actual = await vi.importActual<typeof import('@dnd-kit/core')>('@dnd-kit/core');
  return {
    ...actual,
    DndContext: ({ children, onDragEnd }: { children: React.ReactNode; onDragEnd: typeof capturedOnDragEnd }) => {
      capturedOnDragEnd = onDragEnd;
      return <div>{children}</div>;
    },
    useDroppable: () => ({ setNodeRef: () => {} }),
  };
});

vi.mock('@dnd-kit/sortable', async () => {
  const actual = await vi.importActual<typeof import('@dnd-kit/sortable')>('@dnd-kit/sortable');
  return {
    ...actual,
    useSortable: () => ({
      attributes: {},
      listeners: {},
      setNodeRef: () => {},
      transform: null,
      transition: undefined,
      isDragging: false,
    }),
    SortableContext: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  };
});

function makeJob(overrides: Partial<Job>): Job {
  return {
    id: 1,
    stage: 'wishlist',
    position: 0,
    title: 'Engineer',
    company: 'Acme',
    location: null,
    salary: null,
    description: null,
    sourceUrl: null,
    rawInput: null,
    extraFields: null,
    createdAt: '2026-08-15T00:00:00.000Z',
    updatedAt: '2026-08-15T00:00:00.000Z',
    ...overrides,
  };
}

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  capturedOnDragEnd = undefined;
  vi.restoreAllMocks();
});

describe('moveJobOptimistically', () => {
  it('moves a job into a new stage at the given position and renumbers the destination', () => {
    const jobs = [
      makeJob({ id: 1, stage: 'wishlist', position: 0 }),
      makeJob({ id: 2, stage: 'applied', position: 0 }),
    ];
    const result = moveJobOptimistically(jobs, 1, 'applied', 0);
    expect(result.find((j) => j.id === 1)).toMatchObject({ stage: 'applied', position: 0 });
    expect(result.find((j) => j.id === 2)).toMatchObject({ stage: 'applied', position: 1 });
  });

  it('returns the original array unchanged when the job id is not found', () => {
    const jobs = [makeJob({ id: 1 })];
    const result = moveJobOptimistically(jobs, 999, 'applied', 0);
    expect(result).toBe(jobs);
  });
});

describe('Board', () => {
  it('fetches jobs on mount and renders all 5 columns', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ jobs: [makeJob({ id: 1, stage: 'wishlist' })] }),
    }) as unknown as typeof fetch;

    render(<Board onJobClick={() => {}} />);

    await waitFor(() => expect(screen.getByText('Wishlist')).toBeInTheDocument());
    expect(screen.getByText('Applied')).toBeInTheDocument();
    expect(screen.getByText('Interviewing')).toBeInTheDocument();
    expect(screen.getByText('Offer')).toBeInTheDocument();
    expect(screen.getByText('Rejected')).toBeInTheDocument();
    expect(screen.getByText('Engineer')).toBeInTheDocument();
  });

  it('sends an optimistic PATCH when a drag-end event moves a card to a new column', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/jobs') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ jobs: [makeJob({ id: 1, stage: 'wishlist', position: 0 })] }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({ job: makeJob({ id: 1, stage: 'applied', position: 0 }) }) });
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<Board onJobClick={() => {}} />);
    await waitFor(() => expect(screen.getByText('Engineer')).toBeInTheDocument());

    capturedOnDragEnd?.({ active: { id: 1 }, over: { id: 'applied' } });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/jobs/1',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ stage: 'applied', position: 0 }),
        })
      );
    });
  });

  it('rolls back the optimistic move when the PATCH request fails', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/jobs') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ jobs: [makeJob({ id: 1, stage: 'wishlist', position: 0 })] }),
        });
      }
      return Promise.resolve({ ok: false, json: async () => ({ error: 'failed' }) });
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<Board onJobClick={() => {}} />);
    await waitFor(() => expect(screen.getByText('Engineer')).toBeInTheDocument());

    capturedOnDragEnd?.({ active: { id: 1 }, over: { id: 'applied' } });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/jobs/1', expect.objectContaining({ method: 'PATCH' }));
    });
    await waitFor(() => {
      expect(screen.getAllByText('Engineer')).toHaveLength(1);
    });
  });
});
```

- [ ] **Step 7: Run tests to verify they fail**

Run: `npx vitest run components/board/Board.test.tsx`
Expected: FAIL — `./Board` cannot be found.

- [ ] **Step 8: Implement `components/board/Board.tsx`**

```tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  closestCenter,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import Column from './Column';
import JobCard from './JobCard';
import { STAGES } from '@/lib/types';
import type { Job, Stage } from '@/lib/types';

export function moveJobOptimistically(jobs: Job[], jobId: number, newStage: Stage, newPosition: number): Job[] {
  const job = jobs.find((j) => j.id === jobId);
  if (!job) return jobs;

  const withoutJob = jobs.filter((j) => j.id !== jobId);
  const destinationJobs = withoutJob.filter((j) => j.stage === newStage).sort((a, b) => a.position - b.position);
  const otherJobs = withoutJob.filter((j) => j.stage !== newStage);

  const updatedJob: Job = { ...job, stage: newStage, position: newPosition };
  const clampedPosition = Math.max(0, Math.min(newPosition, destinationJobs.length));
  const reinserted = [...destinationJobs];
  reinserted.splice(clampedPosition, 0, updatedJob);
  const renumberedDestination = reinserted.map((j, index) => ({ ...j, position: index }));

  return [...otherJobs, ...renumberedDestination];
}

function SortableJobCard({ job, onClick }: { job: Job; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: job.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition: transition ?? undefined,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <JobCard job={job} onClick={onClick} />
    </div>
  );
}

function DroppableColumn({
  stage,
  jobs,
  onJobClick,
}: {
  stage: Stage;
  jobs: Job[];
  onJobClick: (job: Job) => void;
}) {
  const { setNodeRef } = useDroppable({ id: stage });

  return (
    <div ref={setNodeRef}>
      <SortableContext items={jobs.map((j) => j.id)} strategy={verticalListSortingStrategy}>
        <Column
          stage={stage}
          jobs={jobs}
          onJobClick={onJobClick}
          renderJob={(job) => <SortableJobCard job={job} onClick={() => onJobClick(job)} />}
        />
      </SortableContext>
    </div>
  );
}

interface BoardProps {
  onJobClick: (job: Job) => void;
}

export default function Board({ onJobClick }: BoardProps) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const loadJobs = useCallback(async () => {
    const res = await fetch('/api/jobs');
    const json = await res.json();
    setJobs(json.jobs ?? []);
  }, []);

  useEffect(() => {
    loadJobs().finally(() => setIsLoading(false));
  }, [loadJobs]);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;

    const activeJob = jobs.find((j) => j.id === active.id);
    if (!activeJob) return;

    const overIsStage = (STAGES as readonly string[]).includes(String(over.id));
    const destinationStage: Stage = overIsStage
      ? (over.id as Stage)
      : jobs.find((j) => j.id === over.id)?.stage ?? activeJob.stage;

    const destinationSiblings = jobs
      .filter((j) => j.stage === destinationStage && j.id !== activeJob.id)
      .sort((a, b) => a.position - b.position);

    let destinationPosition: number;
    if (overIsStage) {
      destinationPosition = destinationSiblings.length;
    } else {
      const overIndex = destinationSiblings.findIndex((j) => j.id === over.id);
      destinationPosition = overIndex === -1 ? destinationSiblings.length : overIndex;
    }

    if (destinationStage === activeJob.stage && destinationPosition === activeJob.position) return;

    const previousJobs = jobs;
    setJobs((current) => moveJobOptimistically(current, activeJob.id, destinationStage, destinationPosition));

    fetch(`/api/jobs/${activeJob.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stage: destinationStage, position: destinationPosition }),
    })
      .then((res) => {
        if (!res.ok) throw new Error('Move failed');
        return loadJobs();
      })
      .catch(() => {
        setJobs(previousJobs);
      });
  }

  if (isLoading) {
    return <div className="p-lg text-body text-ink-subtle">Loading board...</div>;
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <div className="flex gap-md overflow-x-auto p-lg">
        {STAGES.map((stage) => (
          <DroppableColumn
            key={stage}
            stage={stage}
            jobs={jobs.filter((j) => j.stage === stage).sort((a, b) => a.position - b.position)}
            onJobClick={onJobClick}
          />
        ))}
      </div>
    </DndContext>
  );
}
```

- [ ] **Step 9: Run tests to verify they pass**

Run: `npx vitest run components/board/Board.test.tsx`
Expected: PASS (5 tests)

- [ ] **Step 10: Commit**

```bash
git add components/board/Column.tsx components/board/Column.test.tsx \
  components/board/Board.tsx components/board/Board.test.tsx package.json package-lock.json
git commit -m "feat(job-tracker): add Board with dnd-kit wiring and optimistic move"
```

---

### Task 18: `components/board/ExtractedJobForm.tsx` and `components/board/AddJobDialog.tsx`

**Files:**
- Create: `components/board/ExtractedJobForm.tsx`
- Test: `components/board/ExtractedJobForm.test.tsx`
- Create: `components/board/AddJobDialog.tsx`
- Test: `components/board/AddJobDialog.test.tsx`

**Interfaces:**
- Consumes: `Input`, `Textarea`, `Button`, `Dialog`/`DialogContent`/`DialogHeader`/`DialogTitle`, `Tabs`/`TabsList`/`TabsTrigger`/`TabsContent` from `components/ui/*` (Task 2); `Job` from `lib/types.ts` (Task 3); `POST /api/jobs/extract` (Task 11) and `POST /api/jobs` (Task 12) via `fetch`.
- Produces: `interface ExtractedJobFormValues { title: string; company: string; location: string; salary: string; description: string; sourceUrl: string }`, `ExtractedJobForm`, props `{ value: ExtractedJobFormValues; onChange: (value: ExtractedJobFormValues) => void; onSubmit: () => void; submitLabel: string }`. `AddJobDialog`, props `{ open: boolean; onOpenChange: (open: boolean) => void; onJobCreated: (job: Job) => void }`.
- Consumed by: `app/page.tsx` (Task 21, `AddJobDialog`); `ExtractedJobForm` is reused by `app/jobs/[id]/page.tsx` (Task 19) for job-detail edit mode.

- [ ] **Step 1: Write the failing tests for `ExtractedJobForm`**

`components/board/ExtractedJobForm.test.tsx`:
```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import ExtractedJobForm, { type ExtractedJobFormValues } from './ExtractedJobForm';

const emptyValues: ExtractedJobFormValues = {
  title: '',
  company: '',
  location: '',
  salary: '',
  description: '',
  sourceUrl: '',
};

describe('ExtractedJobForm', () => {
  it('renders the given field values', () => {
    render(
      <ExtractedJobForm
        value={{ ...emptyValues, title: 'Engineer', company: 'Acme' }}
        onChange={() => {}}
        onSubmit={() => {}}
        submitLabel="Add Job"
      />
    );
    expect(screen.getByLabelText('Title')).toHaveValue('Engineer');
    expect(screen.getByLabelText('Company')).toHaveValue('Acme');
  });

  it('calls onChange with the updated field when the user edits an input', () => {
    const onChange = vi.fn();
    render(<ExtractedJobForm value={emptyValues} onChange={onChange} onSubmit={() => {}} submitLabel="Add Job" />);
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'New Title' } });
    expect(onChange).toHaveBeenCalledWith({ ...emptyValues, title: 'New Title' });
  });

  it('calls onSubmit when the submit button is clicked', () => {
    const onSubmit = vi.fn();
    render(<ExtractedJobForm value={emptyValues} onChange={() => {}} onSubmit={onSubmit} submitLabel="Add Job" />);
    fireEvent.click(screen.getByRole('button', { name: 'Add Job' }));
    expect(onSubmit).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run components/board/ExtractedJobForm.test.tsx`
Expected: FAIL — `./ExtractedJobForm` cannot be found.

- [ ] **Step 3: Implement `components/board/ExtractedJobForm.tsx`**

```tsx
'use client';

import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';

export interface ExtractedJobFormValues {
  title: string;
  company: string;
  location: string;
  salary: string;
  description: string;
  sourceUrl: string;
}

interface ExtractedJobFormProps {
  value: ExtractedJobFormValues;
  onChange: (value: ExtractedJobFormValues) => void;
  onSubmit: () => void;
  submitLabel: string;
}

export default function ExtractedJobForm({ value, onChange, onSubmit, submitLabel }: ExtractedJobFormProps) {
  function setField<K extends keyof ExtractedJobFormValues>(field: K, fieldValue: string) {
    onChange({ ...value, [field]: fieldValue });
  }

  return (
    <form
      className="flex flex-col gap-sm"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <label className="flex flex-col gap-1 text-body-sm text-ink-muted">
        Title
        <Input value={value.title} onChange={(e) => setField('title', e.target.value)} aria-label="Title" />
      </label>
      <label className="flex flex-col gap-1 text-body-sm text-ink-muted">
        Company
        <Input value={value.company} onChange={(e) => setField('company', e.target.value)} aria-label="Company" />
      </label>
      <label className="flex flex-col gap-1 text-body-sm text-ink-muted">
        Location
        <Input value={value.location} onChange={(e) => setField('location', e.target.value)} aria-label="Location" />
      </label>
      <label className="flex flex-col gap-1 text-body-sm text-ink-muted">
        Salary
        <Input value={value.salary} onChange={(e) => setField('salary', e.target.value)} aria-label="Salary" />
      </label>
      <label className="flex flex-col gap-1 text-body-sm text-ink-muted">
        Source URL
        <Input value={value.sourceUrl} onChange={(e) => setField('sourceUrl', e.target.value)} aria-label="Source URL" />
      </label>
      <label className="flex flex-col gap-1 text-body-sm text-ink-muted">
        Description
        <Textarea
          value={value.description}
          onChange={(e) => setField('description', e.target.value)}
          aria-label="Description"
          rows={6}
        />
      </label>
      <Button type="submit">{submitLabel}</Button>
    </form>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run components/board/ExtractedJobForm.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Write the failing tests for `AddJobDialog`**

`components/board/AddJobDialog.test.tsx`:
```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AddJobDialog from './AddJobDialog';

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('AddJobDialog', () => {
  it('extracts from a pasted URL and shows the editable preview form', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        extracted: {
          title: 'Engineer',
          company: 'Acme',
          location: 'Remote',
          salary: null,
          description: 'Do stuff.',
          sourceUrl: null,
          extraFields: {},
        },
        rawText: 'raw posting text',
      }),
    }) as unknown as typeof fetch;

    render(<AddJobDialog open={true} onOpenChange={() => {}} onJobCreated={() => {}} />);

    fireEvent.change(screen.getByLabelText('Job posting URL'), { target: { value: 'https://acme.example/jobs/1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Extract' }));

    await waitFor(() => expect(screen.getByLabelText('Title')).toHaveValue('Engineer'));
    expect(screen.getByLabelText('Company')).toHaveValue('Acme');
  });

  it('switches to the paste-text tab and shows a message when the url fetch is blocked', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({
        error: 'Could not fetch this URL — paste the job description text instead.',
        blocked: true,
      }),
    }) as unknown as typeof fetch;

    render(<AddJobDialog open={true} onOpenChange={() => {}} onJobCreated={() => {}} />);

    fireEvent.change(screen.getByLabelText('Job posting URL'), { target: { value: 'https://linkedin.example/jobs/1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Extract' }));

    await waitFor(() => {
      expect(screen.getByText(/paste the job description text instead/)).toBeInTheDocument();
    });
    expect(screen.getByLabelText('Job posting text')).toBeInTheDocument();
  });

  it('confirms the preview form and calls onJobCreated with the created job', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/jobs/extract') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            extracted: {
              title: 'Engineer',
              company: 'Acme',
              location: null,
              salary: null,
              description: null,
              sourceUrl: null,
              extraFields: {},
            },
            rawText: 'raw text',
          }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({
          job: {
            id: 1,
            stage: 'wishlist',
            position: 0,
            title: 'Engineer',
            company: 'Acme',
            location: null,
            salary: null,
            description: null,
            sourceUrl: null,
            rawInput: 'raw text',
            extraFields: null,
            createdAt: '2026-08-15T00:00:00.000Z',
            updatedAt: '2026-08-15T00:00:00.000Z',
          },
        }),
      });
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const onJobCreated = vi.fn();
    render(<AddJobDialog open={true} onOpenChange={() => {}} onJobCreated={onJobCreated} />);

    fireEvent.change(screen.getByLabelText('Job posting URL'), { target: { value: 'https://acme.example/jobs/1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Extract' }));

    await waitFor(() => expect(screen.getByLabelText('Title')).toHaveValue('Engineer'));

    fireEvent.click(screen.getByRole('button', { name: 'Add Job' }));

    await waitFor(() => {
      expect(onJobCreated).toHaveBeenCalledWith(expect.objectContaining({ id: 1, title: 'Engineer' }));
    });
    expect(fetchMock).toHaveBeenCalledWith('/api/jobs', expect.objectContaining({ method: 'POST' }));
  });
});
```

- [ ] **Step 6: Run tests to verify they fail**

Run: `npx vitest run components/board/AddJobDialog.test.tsx`
Expected: FAIL — `./AddJobDialog` cannot be found.

- [ ] **Step 7: Implement `components/board/AddJobDialog.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import ExtractedJobForm, { type ExtractedJobFormValues } from './ExtractedJobForm';
import type { Job } from '@/lib/types';

const EMPTY_FORM_VALUES: ExtractedJobFormValues = {
  title: '',
  company: '',
  location: '',
  salary: '',
  description: '',
  sourceUrl: '',
};

interface AddJobDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onJobCreated: (job: Job) => void;
}

export default function AddJobDialog({ open, onOpenChange, onJobCreated }: AddJobDialogProps) {
  const [step, setStep] = useState<'input' | 'preview'>('input');
  const [inputMode, setInputMode] = useState<'url' | 'text'>('url');
  const [url, setUrl] = useState('');
  const [text, setText] = useState('');
  const [formValues, setFormValues] = useState<ExtractedJobFormValues>(EMPTY_FORM_VALUES);
  const [rawText, setRawText] = useState('');
  const [extraFields, setExtraFields] = useState<Record<string, string> | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setStep('input');
    setInputMode('url');
    setUrl('');
    setText('');
    setFormValues(EMPTY_FORM_VALUES);
    setRawText('');
    setExtraFields(null);
    setError(null);
  }

  async function handleExtract() {
    setError(null);
    setIsExtracting(true);
    try {
      const body = inputMode === 'url' ? { url } : { text };
      const res = await fetch('/api/jobs/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();

      if (!res.ok) {
        if (json.blocked) {
          setInputMode('text');
          setError(json.error ?? 'Could not fetch that URL — paste the job description instead.');
          return;
        }
        setError(json.error ?? 'Extraction failed.');
        return;
      }

      setFormValues({
        title: json.extracted.title ?? '',
        company: json.extracted.company ?? '',
        location: json.extracted.location ?? '',
        salary: json.extracted.salary ?? '',
        description: json.extracted.description ?? '',
        sourceUrl: json.extracted.sourceUrl ?? (inputMode === 'url' ? url : ''),
      });
      setRawText(json.rawText);
      setExtraFields(json.extracted.extraFields ?? null);
      setStep('preview');
    } finally {
      setIsExtracting(false);
    }
  }

  async function handleConfirm() {
    setError(null);
    const res = await fetch('/api/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: formValues.title,
        company: formValues.company,
        location: formValues.location,
        salary: formValues.salary,
        description: formValues.description,
        sourceUrl: formValues.sourceUrl,
        rawInput: rawText,
        extraFields,
      }),
    });
    const json = await res.json();

    if (!res.ok) {
      setError(json.error ?? 'Could not create the job.');
      return;
    }

    onJobCreated(json.job);
    reset();
    onOpenChange(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{step === 'input' ? 'Add a job' : 'Confirm job details'}</DialogTitle>
        </DialogHeader>

        {step === 'input' && (
          <div className="flex flex-col gap-sm">
            <Tabs value={inputMode} onValueChange={(v) => setInputMode(v as 'url' | 'text')}>
              <TabsList>
                <TabsTrigger value="url">URL</TabsTrigger>
                <TabsTrigger value="text">Paste text</TabsTrigger>
              </TabsList>
              <TabsContent value="url">
                <Input
                  aria-label="Job posting URL"
                  placeholder="https://company.example/careers/job-id"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                />
              </TabsContent>
              <TabsContent value="text">
                <Textarea
                  aria-label="Job posting text"
                  placeholder="Paste the job description here"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={8}
                />
              </TabsContent>
            </Tabs>
            {error && <p className="text-body-sm text-red-400">{error}</p>}
            <Button
              onClick={handleExtract}
              disabled={isExtracting || (inputMode === 'url' ? url.trim().length === 0 : text.trim().length === 0)}
            >
              {isExtracting ? 'Extracting...' : 'Extract'}
            </Button>
          </div>
        )}

        {step === 'preview' && (
          <div className="flex flex-col gap-sm">
            {error && <p className="text-body-sm text-red-400">{error}</p>}
            <ExtractedJobForm
              value={formValues}
              onChange={setFormValues}
              onSubmit={handleConfirm}
              submitLabel="Add Job"
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npx vitest run components/board/AddJobDialog.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 9: Commit**

```bash
git add components/board/ExtractedJobForm.tsx components/board/ExtractedJobForm.test.tsx \
  components/board/AddJobDialog.tsx components/board/AddJobDialog.test.tsx
git commit -m "feat(job-tracker): add add-job input/preview/confirm flow"
```

---

### Task 19: Job detail page and `components/job-detail/*`

**Files:**
- Modify: `app/api/jobs/[id]/kit/route.ts`, `app/api/jobs/[id]/kit/route.test.ts` (add a `PATCH` handler for per-field autosave)
- Create: `components/job-detail/JobHeader.tsx`, `components/job-detail/JobHeader.test.tsx`
- Create: `components/job-detail/JobDescription.tsx`, `components/job-detail/JobDescription.test.tsx`
- Create: `components/job-detail/CoverLetterSection.tsx`, `components/job-detail/CoverLetterSection.test.tsx`
- Create: `components/job-detail/ResumeBulletsSection.tsx`, `components/job-detail/ResumeBulletsSection.test.tsx`
- Create: `components/job-detail/InterviewQuestionsSection.tsx`, `components/job-detail/InterviewQuestionsSection.test.tsx`
- Create: `components/job-detail/CompanyBriefSection.tsx`, `components/job-detail/CompanyBriefSection.test.tsx`
- Create: `components/job-detail/KitPanel.tsx`, `components/job-detail/KitPanel.test.tsx`
- Create: `app/jobs/[id]/page.tsx`, `app/jobs/[id]/page.test.tsx`

**Interfaces:**
- Consumes: `Job`, `JobKit`, `Stage` from `lib/types.ts` (Task 3); `Button`, `Badge`, `Dialog`/`DialogContent`/`DialogHeader`/`DialogTitle`/`DialogFooter`, `Textarea` from `components/ui/*` (Task 2); `ExtractedJobForm`, `type ExtractedJobFormValues` from `components/board/ExtractedJobForm.tsx` (Task 18); `GET`/`PATCH`/`DELETE /api/jobs/[id]` (Task 13) and `POST`/`PATCH /api/jobs/[id]/kit` (Task 14 + this task) via `fetch`.
- Produces: `JobHeader`, props `{ job: Job; onEdit: () => void; onDelete: () => void }`. `JobDescription`, props `{ job: Job }`. `CoverLetterSection`, props `{ jobId: number; coverLetter: string | null }`. `ResumeBulletsSection`, props `{ jobId: number; resumeBullets: string[] | null }`. `InterviewQuestionsSection`, props `{ jobId: number; interviewQuestions: string[] | null }`. `CompanyBriefSection`, props `{ jobId: number; companyBrief: string | null; companyBriefSources: string[] | null }`. `KitPanel`, props `{ jobId: number; kit: JobKit | null }`. Default export `JobDetailPage` at `app/jobs/[id]/page.tsx`.
- Consumed by: `app/jobs/[id]/page.tsx` consumes all of the above; the page itself is routed to by `Board`'s `onJobClick` (wired in Task 21).

**Autosave contract:** every kit section is a controlled `Textarea` that debounces 800ms after the last keystroke, then `PATCH`es `/api/jobs/[id]/kit` with `{ field: KitField; value: string | string[] }` — plain text for `cover_letter`/`company_brief`, a newline-split array for `resume_bullets`/`interview_questions`. This requires extending Task 14's kit route with a `PATCH` handler (Task 14 only built `POST` for Generate/Regenerate).

- [ ] **Step 1: Write the failing tests for the new `PATCH /api/jobs/[id]/kit` handler**

Append to `app/api/jobs/[id]/kit/route.test.ts` (add `PATCH` to the existing `import { POST } from './route';` line):

```ts
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
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run "app/api/jobs/[id]/kit/route.test.ts"`
Expected: FAIL — `PATCH` is not exported from `./route` yet.

- [ ] **Step 3: Append the `PATCH` handler to `app/api/jobs/[id]/kit/route.ts`**

Add `getKit` (already imported) usage and this import addition: change `import { getDb, getJob, getProfile, upsertKitField, getKit, type KitField } from '@/lib/db';` to also nothing extra is needed — `getKit` is already imported. Then append:

```ts
const EDITABLE_FIELDS: KitField[] = ['cover_letter', 'resume_bullets', 'interview_questions', 'company_brief'];

interface PatchKitRequestBody {
  field?: unknown;
  value?: unknown;
}

export async function PATCH(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { id } = await params;
  const jobId = Number(id);
  if (!Number.isInteger(jobId)) {
    return NextResponse.json({ error: 'Invalid job id.' }, { status: 400 });
  }

  const db = getDb();
  const job = getJob(db, jobId);
  if (!job) {
    return NextResponse.json({ error: 'Job not found.' }, { status: 404 });
  }

  const body = (await request.json()) as PatchKitRequestBody;
  if (typeof body.field !== 'string' || !EDITABLE_FIELDS.includes(body.field as KitField)) {
    return NextResponse.json({ error: 'field must be one of: ' + EDITABLE_FIELDS.join(', ') }, { status: 400 });
  }

  const field = body.field as KitField;
  const isArrayField = field === 'resume_bullets' || field === 'interview_questions';

  if (isArrayField) {
    if (!Array.isArray(body.value) || !body.value.every((v) => typeof v === 'string')) {
      return NextResponse.json({ error: 'value must be an array of strings for this field.' }, { status: 400 });
    }
  } else if (typeof body.value !== 'string') {
    return NextResponse.json({ error: 'value must be a string for this field.' }, { status: 400 });
  }

  const existingKit = getKit(db, jobId);
  const model = field === 'company_brief' ? existingKit?.modelWeb ?? WEB_MODEL_SLUG : existingKit?.modelText ?? TEXT_MODEL_SLUG;

  const kit = upsertKitField(db, {
    jobId,
    field,
    value: isArrayField ? JSON.stringify(body.value) : (body.value as string),
    model,
  });

  return NextResponse.json({ kit });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run "app/api/jobs/[id]/kit/route.test.ts"`
Expected: PASS (9 tests)

- [ ] **Step 5: Commit the route extension**

```bash
git add "app/api/jobs/[id]/kit/route.ts" "app/api/jobs/[id]/kit/route.test.ts"
git commit -m "feat(job-tracker): add PATCH /api/jobs/[id]/kit for per-field autosave"
```

- [ ] **Step 6: Write the failing tests for `JobHeader`**

`components/job-detail/JobHeader.test.tsx`:
```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import JobHeader from './JobHeader';
import type { Job } from '@/lib/types';

const job: Job = {
  id: 1,
  stage: 'applied',
  position: 0,
  title: 'Senior Backend Engineer',
  company: 'Acme Corp',
  location: 'Remote',
  salary: '$160k-$190k',
  description: null,
  sourceUrl: null,
  rawInput: null,
  extraFields: null,
  createdAt: '2026-08-15T00:00:00.000Z',
  updatedAt: '2026-08-15T00:00:00.000Z',
};

describe('JobHeader', () => {
  it('renders the title, company, location, salary, and stage badge', () => {
    render(<JobHeader job={job} onEdit={() => {}} onDelete={() => {}} />);
    expect(screen.getByText('Senior Backend Engineer')).toBeInTheDocument();
    expect(screen.getByText(/Acme Corp/)).toBeInTheDocument();
    expect(screen.getByText('$160k-$190k')).toBeInTheDocument();
    expect(screen.getByText('Applied')).toBeInTheDocument();
  });

  it('calls onEdit when the Edit button is clicked', () => {
    const onEdit = vi.fn();
    render(<JobHeader job={job} onEdit={onEdit} onDelete={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(onEdit).toHaveBeenCalled();
  });

  it('shows a confirm dialog before calling onDelete, and only deletes on confirm', () => {
    const onDelete = vi.fn();
    render(<JobHeader job={job} onEdit={() => {}} onDelete={onDelete} />);

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(screen.getByText('Delete this job?')).toBeInTheDocument();
    expect(onDelete).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Yes, delete' }));
    expect(onDelete).toHaveBeenCalled();
  });
});
```

- [ ] **Step 7: Run test to verify it fails**

Run: `npx vitest run components/job-detail/JobHeader.test.tsx`
Expected: FAIL — `./JobHeader` cannot be found.

- [ ] **Step 8: Implement `components/job-detail/JobHeader.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import type { Job } from '@/lib/types';

const STAGE_LABELS: Record<Job['stage'], string> = {
  wishlist: 'Wishlist',
  applied: 'Applied',
  interviewing: 'Interviewing',
  offer: 'Offer',
  rejected: 'Rejected',
};

interface JobHeaderProps {
  job: Job;
  onEdit: () => void;
  onDelete: () => void;
}

export default function JobHeader({ job, onEdit, onDelete }: JobHeaderProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <div className="flex flex-col gap-sm">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-headline text-ink">{job.title ?? 'Untitled role'}</h1>
          <p className="text-body text-ink-muted">
            {job.company ?? 'Unknown company'}
            {job.location ? ` · ${job.location}` : ''}
          </p>
        </div>
        <Badge className="rounded-full">{STAGE_LABELS[job.stage]}</Badge>
      </div>
      {job.salary && <p className="text-body-sm text-ink-subtle">{job.salary}</p>}
      <div className="flex gap-xs">
        <Button variant="outline" onClick={onEdit}>
          Edit
        </Button>
        <Button variant="outline" onClick={() => setConfirmOpen(true)}>
          Delete
        </Button>
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this job?</DialogTitle>
          </DialogHeader>
          <p className="text-body-sm text-ink-muted">This cannot be undone.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                setConfirmOpen(false);
                onDelete();
              }}
            >
              Yes, delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
```

- [ ] **Step 9: Run test to verify it passes**

Run: `npx vitest run components/job-detail/JobHeader.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 10: Write the failing tests for `JobDescription`**

`components/job-detail/JobDescription.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import JobDescription from './JobDescription';
import type { Job } from '@/lib/types';

const baseJob: Job = {
  id: 1,
  stage: 'wishlist',
  position: 0,
  title: 'Engineer',
  company: 'Acme',
  location: null,
  salary: null,
  description: 'Build reliable backend services.',
  sourceUrl: null,
  rawInput: null,
  extraFields: null,
  createdAt: '2026-08-15T00:00:00.000Z',
  updatedAt: '2026-08-15T00:00:00.000Z',
};

describe('JobDescription', () => {
  it('renders the job description', () => {
    render(<JobDescription job={baseJob} />);
    expect(screen.getByText('Build reliable backend services.')).toBeInTheDocument();
  });

  it('shows a fallback when there is no description', () => {
    render(<JobDescription job={{ ...baseJob, description: null }} />);
    expect(screen.getByText('No description.')).toBeInTheDocument();
  });
});
```

- [ ] **Step 11: Run test to verify it fails**

Run: `npx vitest run components/job-detail/JobDescription.test.tsx`
Expected: FAIL — `./JobDescription` cannot be found.

- [ ] **Step 12: Implement `components/job-detail/JobDescription.tsx`**

```tsx
import type { Job } from '@/lib/types';

interface JobDescriptionProps {
  job: Job;
}

export default function JobDescription({ job }: JobDescriptionProps) {
  return (
    <div className="flex flex-col gap-xs">
      <h2 className="text-body font-medium text-ink">Description</h2>
      <p className="whitespace-pre-wrap text-body text-ink-muted">{job.description ?? 'No description.'}</p>
    </div>
  );
}
```

- [ ] **Step 13: Run test to verify it passes**

Run: `npx vitest run components/job-detail/JobDescription.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 14: Write the failing tests for `CoverLetterSection`**

`components/job-detail/CoverLetterSection.test.tsx`:
```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import CoverLetterSection from './CoverLetterSection';

const originalFetch = global.fetch;

beforeEach(() => {
  vi.useFakeTimers();
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }) as unknown as typeof fetch;
});

afterEach(() => {
  vi.useRealTimers();
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('CoverLetterSection', () => {
  it('renders the given cover letter text', () => {
    render(<CoverLetterSection jobId={1} coverLetter="Dear hiring manager..." />);
    expect(screen.getByLabelText('Cover Letter')).toHaveValue('Dear hiring manager...');
  });

  it('debounces autosave — does not PATCH immediately on keystroke', () => {
    render(<CoverLetterSection jobId={1} coverLetter="" />);
    fireEvent.change(screen.getByLabelText('Cover Letter'), { target: { value: 'Edited text' } });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('PATCHes the edited value after the debounce delay', () => {
    render(<CoverLetterSection jobId={1} coverLetter="" />);
    fireEvent.change(screen.getByLabelText('Cover Letter'), { target: { value: 'Edited text' } });
    vi.advanceTimersByTime(800);
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/jobs/1/kit',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ field: 'cover_letter', value: 'Edited text' }),
      })
    );
  });
});
```

- [ ] **Step 15: Run test to verify it fails**

Run: `npx vitest run components/job-detail/CoverLetterSection.test.tsx`
Expected: FAIL — `./CoverLetterSection` cannot be found.

- [ ] **Step 16: Implement `components/job-detail/CoverLetterSection.tsx`**

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { Textarea } from '@/components/ui/textarea';

interface CoverLetterSectionProps {
  jobId: number;
  coverLetter: string | null;
}

const AUTOSAVE_DELAY_MS = 800;

export default function CoverLetterSection({ jobId, coverLetter }: CoverLetterSectionProps) {
  const [value, setValue] = useState(coverLetter ?? '');
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setValue(coverLetter ?? '');
  }, [coverLetter]);

  function handleChange(next: string) {
    setValue(next);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      fetch(`/api/jobs/${jobId}/kit`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ field: 'cover_letter', value: next }),
      });
    }, AUTOSAVE_DELAY_MS);
  }

  return (
    <section className="flex flex-col gap-xs">
      <h3 className="text-body font-medium text-ink">Cover Letter</h3>
      <Textarea aria-label="Cover Letter" value={value} onChange={(e) => handleChange(e.target.value)} rows={10} />
    </section>
  );
}
```

- [ ] **Step 17: Run test to verify it passes**

Run: `npx vitest run components/job-detail/CoverLetterSection.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 18: Write the failing tests for `ResumeBulletsSection`**

`components/job-detail/ResumeBulletsSection.test.tsx`:
```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import ResumeBulletsSection from './ResumeBulletsSection';

const originalFetch = global.fetch;

beforeEach(() => {
  vi.useFakeTimers();
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }) as unknown as typeof fetch;
});

afterEach(() => {
  vi.useRealTimers();
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('ResumeBulletsSection', () => {
  it('renders bullets one per line', () => {
    render(<ResumeBulletsSection jobId={1} resumeBullets={['Led migration', 'Cut latency 30%']} />);
    expect(screen.getByLabelText('Resume Bullets')).toHaveValue('Led migration\nCut latency 30%');
  });

  it('PATCHes the parsed bullet array after the debounce delay', () => {
    render(<ResumeBulletsSection jobId={1} resumeBullets={[]} />);
    fireEvent.change(screen.getByLabelText('Resume Bullets'), { target: { value: 'Bullet one\nBullet two\n' } });
    vi.advanceTimersByTime(800);
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/jobs/1/kit',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ field: 'resume_bullets', value: ['Bullet one', 'Bullet two'] }),
      })
    );
  });
});
```

- [ ] **Step 19: Run test to verify it fails**

Run: `npx vitest run components/job-detail/ResumeBulletsSection.test.tsx`
Expected: FAIL — `./ResumeBulletsSection` cannot be found.

- [ ] **Step 20: Implement `components/job-detail/ResumeBulletsSection.tsx`**

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { Textarea } from '@/components/ui/textarea';

interface ResumeBulletsSectionProps {
  jobId: number;
  resumeBullets: string[] | null;
}

const AUTOSAVE_DELAY_MS = 800;

function bulletsToText(bullets: string[] | null): string {
  return (bullets ?? []).join('\n');
}

function textToBullets(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export default function ResumeBulletsSection({ jobId, resumeBullets }: ResumeBulletsSectionProps) {
  const [value, setValue] = useState(bulletsToText(resumeBullets));
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setValue(bulletsToText(resumeBullets));
  }, [resumeBullets]);

  function handleChange(next: string) {
    setValue(next);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      fetch(`/api/jobs/${jobId}/kit`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ field: 'resume_bullets', value: textToBullets(next) }),
      });
    }, AUTOSAVE_DELAY_MS);
  }

  return (
    <section className="flex flex-col gap-xs">
      <h3 className="text-body font-medium text-ink">Resume Bullets</h3>
      <Textarea aria-label="Resume Bullets" value={value} onChange={(e) => handleChange(e.target.value)} rows={6} />
    </section>
  );
}
```

- [ ] **Step 21: Run test to verify it passes**

Run: `npx vitest run components/job-detail/ResumeBulletsSection.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 22: Write the failing tests for `InterviewQuestionsSection`**

`components/job-detail/InterviewQuestionsSection.test.tsx`:
```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import InterviewQuestionsSection from './InterviewQuestionsSection';

const originalFetch = global.fetch;

beforeEach(() => {
  vi.useFakeTimers();
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }) as unknown as typeof fetch;
});

afterEach(() => {
  vi.useRealTimers();
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('InterviewQuestionsSection', () => {
  it('renders questions one per line', () => {
    render(<InterviewQuestionsSection jobId={1} interviewQuestions={['Q1', 'Q2']} />);
    expect(screen.getByLabelText('Interview Questions')).toHaveValue('Q1\nQ2');
  });

  it('PATCHes the parsed question array after the debounce delay', () => {
    render(<InterviewQuestionsSection jobId={1} interviewQuestions={[]} />);
    fireEvent.change(screen.getByLabelText('Interview Questions'), {
      target: { value: 'New question one\nNew question two' },
    });
    vi.advanceTimersByTime(800);
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/jobs/1/kit',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ field: 'interview_questions', value: ['New question one', 'New question two'] }),
      })
    );
  });
});
```

- [ ] **Step 23: Run test to verify it fails**

Run: `npx vitest run components/job-detail/InterviewQuestionsSection.test.tsx`
Expected: FAIL — `./InterviewQuestionsSection` cannot be found.

- [ ] **Step 24: Implement `components/job-detail/InterviewQuestionsSection.tsx`**

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { Textarea } from '@/components/ui/textarea';

interface InterviewQuestionsSectionProps {
  jobId: number;
  interviewQuestions: string[] | null;
}

const AUTOSAVE_DELAY_MS = 800;

function questionsToText(questions: string[] | null): string {
  return (questions ?? []).join('\n');
}

function textToQuestions(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export default function InterviewQuestionsSection({ jobId, interviewQuestions }: InterviewQuestionsSectionProps) {
  const [value, setValue] = useState(questionsToText(interviewQuestions));
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setValue(questionsToText(interviewQuestions));
  }, [interviewQuestions]);

  function handleChange(next: string) {
    setValue(next);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      fetch(`/api/jobs/${jobId}/kit`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ field: 'interview_questions', value: textToQuestions(next) }),
      });
    }, AUTOSAVE_DELAY_MS);
  }

  return (
    <section className="flex flex-col gap-xs">
      <h3 className="text-body font-medium text-ink">Interview Questions</h3>
      <Textarea
        aria-label="Interview Questions"
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        rows={6}
      />
    </section>
  );
}
```

- [ ] **Step 25: Run test to verify it passes**

Run: `npx vitest run components/job-detail/InterviewQuestionsSection.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 26: Write the failing tests for `CompanyBriefSection`**

`components/job-detail/CompanyBriefSection.test.tsx`:
```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import CompanyBriefSection from './CompanyBriefSection';

const originalFetch = global.fetch;

beforeEach(() => {
  vi.useFakeTimers();
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }) as unknown as typeof fetch;
});

afterEach(() => {
  vi.useRealTimers();
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('CompanyBriefSection', () => {
  it('renders the brief text and citation links when sources are present', () => {
    render(
      <CompanyBriefSection
        jobId={1}
        companyBrief="Acme is a fintech company..."
        companyBriefSources={['https://acme.example/about']}
      />
    );
    expect(screen.getByLabelText('Company Brief')).toHaveValue('Acme is a fintech company...');
    expect(screen.getByRole('link', { name: 'https://acme.example/about' })).toHaveAttribute(
      'href',
      'https://acme.example/about'
    );
  });

  it('renders no citation list when there are no sources', () => {
    render(<CompanyBriefSection jobId={1} companyBrief="Some brief" companyBriefSources={null} />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('PATCHes the edited brief text after the debounce delay', () => {
    render(<CompanyBriefSection jobId={1} companyBrief="" companyBriefSources={null} />);
    fireEvent.change(screen.getByLabelText('Company Brief'), { target: { value: 'Edited brief' } });
    vi.advanceTimersByTime(800);
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/jobs/1/kit',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ field: 'company_brief', value: 'Edited brief' }),
      })
    );
  });
});
```

- [ ] **Step 27: Run test to verify it fails**

Run: `npx vitest run components/job-detail/CompanyBriefSection.test.tsx`
Expected: FAIL — `./CompanyBriefSection` cannot be found.

- [ ] **Step 28: Implement `components/job-detail/CompanyBriefSection.tsx`**

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { Textarea } from '@/components/ui/textarea';

interface CompanyBriefSectionProps {
  jobId: number;
  companyBrief: string | null;
  companyBriefSources: string[] | null;
}

const AUTOSAVE_DELAY_MS = 800;

export default function CompanyBriefSection({ jobId, companyBrief, companyBriefSources }: CompanyBriefSectionProps) {
  const [value, setValue] = useState(companyBrief ?? '');
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setValue(companyBrief ?? '');
  }, [companyBrief]);

  function handleChange(next: string) {
    setValue(next);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      fetch(`/api/jobs/${jobId}/kit`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ field: 'company_brief', value: next }),
      });
    }, AUTOSAVE_DELAY_MS);
  }

  return (
    <section className="flex flex-col gap-xs">
      <h3 className="text-body font-medium text-ink">Company Brief</h3>
      <Textarea aria-label="Company Brief" value={value} onChange={(e) => handleChange(e.target.value)} rows={10} />
      {companyBriefSources && companyBriefSources.length > 0 && (
        <ul className="flex flex-col gap-1 text-caption text-ink-subtle">
          {companyBriefSources.map((source) => (
            <li key={source}>
              <a href={source} target="_blank" rel="noreferrer" className="text-accent hover:text-accent-hover">
                {source}
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
```

- [ ] **Step 29: Run test to verify it passes**

Run: `npx vitest run components/job-detail/CompanyBriefSection.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 30: Write the failing tests for `KitPanel`**

`components/job-detail/KitPanel.test.tsx`:
```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import KitPanel from './KitPanel';
import type { JobKit } from '@/lib/types';

vi.mock('./CoverLetterSection', () => ({ default: () => <div>mock-cover-letter</div> }));
vi.mock('./ResumeBulletsSection', () => ({ default: () => <div>mock-resume-bullets</div> }));
vi.mock('./InterviewQuestionsSection', () => ({ default: () => <div>mock-interview-questions</div> }));
vi.mock('./CompanyBriefSection', () => ({ default: () => <div>mock-company-brief</div> }));

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('KitPanel', () => {
  it('shows "No kit generated yet." and a Generate Kit button when there is no kit', () => {
    render(<KitPanel jobId={1} kit={null} />);
    expect(screen.getByText('No kit generated yet.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Generate Kit' })).toBeInTheDocument();
  });

  it('shows the four sections and a Regenerate button when a kit already exists', () => {
    const kit: JobKit = {
      jobId: 1,
      coverLetter: 'Dear hiring manager...',
      coverLetterGeneratedAt: '2026-08-15T00:00:00.000Z',
      resumeBullets: ['Bullet one'],
      resumeBulletsGeneratedAt: '2026-08-15T00:00:00.000Z',
      interviewQuestions: ['Q1', 'Q2', 'Q3', 'Q4', 'Q5'],
      interviewQuestionsGeneratedAt: '2026-08-15T00:00:00.000Z',
      companyBrief: 'Acme is a company...',
      companyBriefGeneratedAt: '2026-08-15T00:00:00.000Z',
      companyBriefSources: null,
      modelText: 'text-model-slug',
      modelWeb: 'web-model-slug',
    };
    render(<KitPanel jobId={1} kit={kit} />);
    expect(screen.getByRole('button', { name: 'Regenerate' })).toBeInTheDocument();
    expect(screen.getByText('mock-cover-letter')).toBeInTheDocument();
    expect(screen.getByText('mock-resume-bullets')).toBeInTheDocument();
    expect(screen.getByText('mock-interview-questions')).toBeInTheDocument();
    expect(screen.getByText('mock-company-brief')).toBeInTheDocument();
  });

  it('calls the kit generation endpoint and shows a partial-failure banner', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        kit: {
          jobId: 1,
          coverLetter: 'Dear hiring manager...',
          coverLetterGeneratedAt: '2026-08-15T00:00:00.000Z',
          resumeBullets: ['Bullet one'],
          resumeBulletsGeneratedAt: '2026-08-15T00:00:00.000Z',
          interviewQuestions: ['Q1', 'Q2', 'Q3', 'Q4', 'Q5'],
          interviewQuestionsGeneratedAt: '2026-08-15T00:00:00.000Z',
          companyBrief: null,
          companyBriefGeneratedAt: null,
          companyBriefSources: null,
          modelText: 'text-model-slug',
          modelWeb: null,
        },
        partial: true,
        errors: { company_brief: 'web search unavailable' },
      }),
    }) as unknown as typeof fetch;

    render(<KitPanel jobId={1} kit={null} />);
    fireEvent.click(screen.getByRole('button', { name: 'Generate Kit' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('1 of 4 sections failed');
    });
    expect(global.fetch).toHaveBeenCalledWith('/api/jobs/1/kit', { method: 'POST' });
  });
});
```

- [ ] **Step 31: Run test to verify it fails**

Run: `npx vitest run components/job-detail/KitPanel.test.tsx`
Expected: FAIL — `./KitPanel` cannot be found.

- [ ] **Step 32: Implement `components/job-detail/KitPanel.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import CoverLetterSection from './CoverLetterSection';
import ResumeBulletsSection from './ResumeBulletsSection';
import InterviewQuestionsSection from './InterviewQuestionsSection';
import CompanyBriefSection from './CompanyBriefSection';
import type { JobKit } from '@/lib/types';

interface KitPanelProps {
  jobId: number;
  kit: JobKit | null;
}

export default function KitPanel({ jobId, kit }: KitPanelProps) {
  const [currentKit, setCurrentKit] = useState<JobKit | null>(kit);
  const [isGenerating, setIsGenerating] = useState(false);
  const [partialErrors, setPartialErrors] = useState<Record<string, string>>({});

  async function handleGenerate() {
    setIsGenerating(true);
    setPartialErrors({});
    try {
      const res = await fetch(`/api/jobs/${jobId}/kit`, { method: 'POST' });
      const json = await res.json();
      setCurrentKit(json.kit);
      if (json.partial) {
        setPartialErrors(json.errors);
      }
    } finally {
      setIsGenerating(false);
    }
  }

  const hasKit = Boolean(
    currentKit &&
      (currentKit.coverLetter || currentKit.resumeBullets || currentKit.interviewQuestions || currentKit.companyBrief)
  );
  const errorCount = Object.keys(partialErrors).length;

  return (
    <div className="flex flex-col gap-md rounded-lg border border-hairline bg-surface-1 p-lg">
      <div className="flex items-center justify-between">
        <h2 className="text-card-title text-ink">Kit</h2>
        <Button onClick={handleGenerate} disabled={isGenerating}>
          {isGenerating ? 'Generating...' : hasKit ? 'Regenerate' : 'Generate Kit'}
        </Button>
      </div>

      {errorCount > 0 && (
        <p className="text-body-sm text-red-400" role="alert">
          {errorCount} of 4 sections failed to generate — click Regenerate to retry.
        </p>
      )}

      {!hasKit && !isGenerating && <p className="text-body-sm text-ink-subtle">No kit generated yet.</p>}

      {currentKit && (
        <div className="flex flex-col gap-md">
          <CoverLetterSection jobId={jobId} coverLetter={currentKit.coverLetter} />
          <ResumeBulletsSection jobId={jobId} resumeBullets={currentKit.resumeBullets} />
          <InterviewQuestionsSection jobId={jobId} interviewQuestions={currentKit.interviewQuestions} />
          <CompanyBriefSection
            jobId={jobId}
            companyBrief={currentKit.companyBrief}
            companyBriefSources={currentKit.companyBriefSources}
          />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 33: Run test to verify it passes**

Run: `npx vitest run components/job-detail/KitPanel.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 34: Write the failing tests for the job detail page**

`app/jobs/[id]/page.test.tsx`:
```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const pushMock = vi.fn();
vi.mock('next/navigation', () => ({
  useParams: () => ({ id: '1' }),
  useRouter: () => ({ push: pushMock }),
}));

vi.mock('@/components/job-detail/JobHeader', () => ({
  default: ({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) => (
    <div>
      <span>mock-job-header</span>
      <button onClick={onEdit}>trigger-edit</button>
      <button onClick={onDelete}>trigger-delete</button>
    </div>
  ),
}));
vi.mock('@/components/job-detail/JobDescription', () => ({ default: () => <div>mock-job-description</div> }));
vi.mock('@/components/job-detail/KitPanel', () => ({ default: () => <div>mock-kit-panel</div> }));
vi.mock('@/components/board/ExtractedJobForm', () => ({
  default: ({ onSubmit }: { onSubmit: () => void }) => (
    <div>
      <span>mock-extracted-job-form</span>
      <button onClick={onSubmit}>trigger-save</button>
    </div>
  ),
}));

import JobDetailPage from './page';

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  pushMock.mockClear();
  vi.restoreAllMocks();
});

const jobResponse = {
  job: {
    id: 1,
    stage: 'wishlist',
    position: 0,
    title: 'Engineer',
    company: 'Acme',
    location: null,
    salary: null,
    description: null,
    sourceUrl: null,
    rawInput: null,
    extraFields: null,
    createdAt: '2026-08-15T00:00:00.000Z',
    updatedAt: '2026-08-15T00:00:00.000Z',
  },
  kit: null,
};

describe('JobDetailPage', () => {
  it('fetches and renders the job header, description, and kit panel', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => jobResponse }) as unknown as typeof fetch;

    render(<JobDetailPage />);

    await waitFor(() => expect(screen.getByText('mock-job-header')).toBeInTheDocument());
    expect(screen.getByText('mock-job-description')).toBeInTheDocument();
    expect(screen.getByText('mock-kit-panel')).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledWith('/api/jobs/1');
  });

  it('switches to the edit form when onEdit fires, and back to the description on save', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => jobResponse }) as unknown as typeof fetch;

    render(<JobDetailPage />);
    await waitFor(() => expect(screen.getByText('mock-job-header')).toBeInTheDocument());

    fireEvent.click(screen.getByText('trigger-edit'));
    expect(screen.getByText('mock-extracted-job-form')).toBeInTheDocument();

    fireEvent.click(screen.getByText('trigger-save'));
    await waitFor(() => expect(screen.getByText('mock-job-description')).toBeInTheDocument());
  });

  it('deletes the job and redirects to the board on delete', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => jobResponse }) as unknown as typeof fetch;

    render(<JobDetailPage />);
    await waitFor(() => expect(screen.getByText('mock-job-header')).toBeInTheDocument());

    fireEvent.click(screen.getByText('trigger-delete'));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/jobs/1', { method: 'DELETE' });
    });
    expect(pushMock).toHaveBeenCalledWith('/');
  });
});
```

- [ ] **Step 35: Run tests to verify they fail**

Run: `npx vitest run "app/jobs/[id]/page.test.tsx"`
Expected: FAIL — `./page` cannot be found.

- [ ] **Step 36: Implement `app/jobs/[id]/page.tsx`**

```tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import JobHeader from '@/components/job-detail/JobHeader';
import JobDescription from '@/components/job-detail/JobDescription';
import KitPanel from '@/components/job-detail/KitPanel';
import ExtractedJobForm, { type ExtractedJobFormValues } from '@/components/board/ExtractedJobForm';
import type { Job, JobKit } from '@/lib/types';

export default function JobDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [job, setJob] = useState<Job | null>(null);
  const [kit, setKit] = useState<JobKit | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [formValues, setFormValues] = useState<ExtractedJobFormValues | null>(null);

  const loadJob = useCallback(async () => {
    const res = await fetch(`/api/jobs/${params.id}`);
    if (!res.ok) return;
    const json = await res.json();
    setJob(json.job);
    setKit(json.kit);
  }, [params.id]);

  useEffect(() => {
    loadJob();
  }, [loadJob]);

  function startEditing() {
    if (!job) return;
    setFormValues({
      title: job.title ?? '',
      company: job.company ?? '',
      location: job.location ?? '',
      salary: job.salary ?? '',
      description: job.description ?? '',
      sourceUrl: job.sourceUrl ?? '',
    });
    setIsEditing(true);
  }

  async function handleSaveEdit() {
    if (!formValues) return;
    await fetch(`/api/jobs/${params.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formValues),
    });
    setIsEditing(false);
    await loadJob();
  }

  async function handleDelete() {
    await fetch(`/api/jobs/${params.id}`, { method: 'DELETE' });
    router.push('/');
  }

  if (!job) {
    return <div className="p-lg text-body text-ink-subtle">Loading...</div>;
  }

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-lg p-lg">
      <JobHeader job={job} onEdit={startEditing} onDelete={handleDelete} />
      {isEditing && formValues ? (
        <ExtractedJobForm value={formValues} onChange={setFormValues} onSubmit={handleSaveEdit} submitLabel="Save" />
      ) : (
        <JobDescription job={job} />
      )}
      <KitPanel jobId={job.id} kit={kit} />
    </main>
  );
}
```

- [ ] **Step 37: Run tests to verify they pass**

Run: `npx vitest run "app/jobs/[id]/page.test.tsx"`
Expected: PASS (3 tests)

- [ ] **Step 38: Commit**

```bash
git add components/job-detail "app/jobs/[id]/page.tsx" "app/jobs/[id]/page.test.tsx"
git commit -m "feat(job-tracker): add job detail page with editable kit sections"
```

---

### Task 20: Profile page and `components/profile/*`

**Files:**
- Create: `components/profile/ResumeUpload.tsx`, `components/profile/ResumeUpload.test.tsx`
- Create: `components/profile/ProfileForm.tsx`, `components/profile/ProfileForm.test.tsx`
- Create: `app/profile/page.tsx`, `app/profile/page.test.tsx`

**Interfaces:**
- Consumes: `Textarea`, `Button` from `components/ui/*` (Task 2); `POST /api/profile/resume` (Task 15) and `GET`/`PATCH /api/profile` (Task 15) via `fetch`.
- Produces: `ResumeUpload`, props `{ onExtracted: (resumeText: string, filename: string) => void }`. `interface ProfileFormValues { resumeText: string; aboutMe: string }`, `ProfileForm`, props `{ value: ProfileFormValues; onChange: (value: ProfileFormValues) => void; onSave: () => void; isSaving: boolean }`. Default export `ProfilePage` at `app/profile/page.tsx`.
- Consumed by: `ProfileForm` embeds `ResumeUpload`; `app/profile/page.tsx` consumes `ProfileForm`; the page itself is routed to from the top-nav (wired in Task 21).

`ResumeUpload` mirrors sketch2app's `components/UploadDropzone.tsx` UX pattern: a `<label>`-wrapped hidden file input, drag-over highlight state, `aria-label` on the input for accessible querying — adapted here to `POST /api/profile/resume` on selection instead of a client-side canvas export.

- [ ] **Step 1: Write the failing tests for `ResumeUpload`**

`components/profile/ResumeUpload.test.tsx`:
```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ResumeUpload from './ResumeUpload';

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('ResumeUpload', () => {
  it('uploads the selected file and calls onExtracted with the extracted text', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ profile: { resumeText: 'Extracted resume text', resumeFilename: 'resume.pdf' } }),
    }) as unknown as typeof fetch;

    const onExtracted = vi.fn();
    render(<ResumeUpload onExtracted={onExtracted} />);

    const input = screen.getByLabelText('Upload resume') as HTMLInputElement;
    const file = new File(['fake pdf bytes'], 'resume.pdf', { type: 'application/pdf' });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(onExtracted).toHaveBeenCalledWith('Extracted resume text', 'resume.pdf');
    });
  });

  it('does nothing when no file is chosen', () => {
    global.fetch = vi.fn() as unknown as typeof fetch;
    render(<ResumeUpload onExtracted={vi.fn()} />);
    const input = screen.getByLabelText('Upload resume') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [] } });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('shows an error message when the upload fails', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Only PDF and DOCX resumes are supported.' }),
    }) as unknown as typeof fetch;

    render(<ResumeUpload onExtracted={vi.fn()} />);
    const input = screen.getByLabelText('Upload resume') as HTMLInputElement;
    const file = new File(['not a resume'], 'resume.txt', { type: 'text/plain' });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText('Only PDF and DOCX resumes are supported.')).toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run components/profile/ResumeUpload.test.tsx`
Expected: FAIL — `./ResumeUpload` cannot be found.

- [ ] **Step 3: Implement `components/profile/ResumeUpload.tsx`**

```tsx
'use client';

import { useState } from 'react';

interface ResumeUploadProps {
  onExtracted: (resumeText: string, filename: string) => void;
}

export default function ResumeUpload({ onExtracted }: ResumeUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setError(null);
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('resume', file);
      const res = await fetch('/api/profile/resume', { method: 'POST', body: formData });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? 'Upload failed.');
        return;
      }
      onExtracted(json.profile.resumeText ?? '', json.profile.resumeFilename ?? file.name);
    } finally {
      setIsUploading(false);
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }

  function handleDrop(e: React.DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) handleFile(file);
  }

  function handleDragOver(e: React.DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setIsDragging(true);
  }

  return (
    <div className="flex flex-col gap-xs">
      <label
        className={`flex h-24 flex-col items-center justify-center rounded-md border-2 border-dashed text-center text-body-sm text-ink-subtle transition-colors ${
          isDragging ? 'border-accent' : 'border-hairline hover:border-accent'
        }`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={() => setIsDragging(false)}
      >
        {isUploading ? 'Uploading...' : 'Drag & drop, or click to upload a PDF or DOCX resume'}
        <input
          type="file"
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          aria-label="Upload resume"
          className="hidden"
          onChange={handleChange}
        />
      </label>
      {error && <p className="text-body-sm text-red-400">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run components/profile/ResumeUpload.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Write the failing tests for `ProfileForm`**

`components/profile/ProfileForm.test.tsx`:
```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import ProfileForm, { type ProfileFormValues } from './ProfileForm';

vi.mock('./ResumeUpload', () => ({ default: () => <div>mock-resume-upload</div> }));

const emptyValues: ProfileFormValues = { resumeText: '', aboutMe: '' };

describe('ProfileForm', () => {
  it('renders the given field values', () => {
    render(
      <ProfileForm
        value={{ resumeText: 'My resume text', aboutMe: 'I like clean APIs.' }}
        onChange={() => {}}
        onSave={() => {}}
        isSaving={false}
      />
    );
    expect(screen.getByLabelText('Resume text')).toHaveValue('My resume text');
    expect(screen.getByLabelText('About me')).toHaveValue('I like clean APIs.');
  });

  it('calls onChange when the resume text is edited', () => {
    const onChange = vi.fn();
    render(<ProfileForm value={emptyValues} onChange={onChange} onSave={() => {}} isSaving={false} />);
    fireEvent.change(screen.getByLabelText('Resume text'), { target: { value: 'New resume' } });
    expect(onChange).toHaveBeenCalledWith({ ...emptyValues, resumeText: 'New resume' });
  });

  it('calls onSave when the Save Profile button is clicked', () => {
    const onSave = vi.fn();
    render(<ProfileForm value={emptyValues} onChange={() => {}} onSave={onSave} isSaving={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Save Profile' }));
    expect(onSave).toHaveBeenCalled();
  });

  it('disables the Save button and shows "Saving..." while isSaving is true', () => {
    render(<ProfileForm value={emptyValues} onChange={() => {}} onSave={() => {}} isSaving={true} />);
    expect(screen.getByRole('button', { name: 'Saving...' })).toBeDisabled();
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npx vitest run components/profile/ProfileForm.test.tsx`
Expected: FAIL — `./ProfileForm` cannot be found.

- [ ] **Step 7: Implement `components/profile/ProfileForm.tsx`**

```tsx
'use client';

import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import ResumeUpload from './ResumeUpload';

export interface ProfileFormValues {
  resumeText: string;
  aboutMe: string;
}

interface ProfileFormProps {
  value: ProfileFormValues;
  onChange: (value: ProfileFormValues) => void;
  onSave: () => void;
  isSaving: boolean;
}

export default function ProfileForm({ value, onChange, onSave, isSaving }: ProfileFormProps) {
  return (
    <form
      className="flex flex-col gap-md"
      onSubmit={(e) => {
        e.preventDefault();
        onSave();
      }}
    >
      <div className="flex flex-col gap-xs">
        <label className="text-body-sm text-ink-muted" htmlFor="resume-text">
          Resume
        </label>
        <ResumeUpload onExtracted={(resumeText) => onChange({ ...value, resumeText })} />
        <Textarea
          id="resume-text"
          aria-label="Resume text"
          value={value.resumeText}
          onChange={(e) => onChange({ ...value, resumeText: e.target.value })}
          rows={12}
        />
      </div>
      <div className="flex flex-col gap-xs">
        <label className="text-body-sm text-ink-muted" htmlFor="about-me">
          About me
        </label>
        <Textarea
          id="about-me"
          aria-label="About me"
          value={value.aboutMe}
          onChange={(e) => onChange({ ...value, aboutMe: e.target.value })}
          rows={4}
        />
      </div>
      <Button type="submit" disabled={isSaving} className="self-start">
        {isSaving ? 'Saving...' : 'Save Profile'}
      </Button>
    </form>
  );
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npx vitest run components/profile/ProfileForm.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 9: Write the failing tests for the profile page**

`app/profile/page.test.tsx`:
```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('@/components/profile/ProfileForm', () => ({
  default: ({
    value,
    onChange,
    onSave,
    isSaving,
  }: {
    value: { resumeText: string; aboutMe: string };
    onChange: (v: { resumeText: string; aboutMe: string }) => void;
    onSave: () => void;
    isSaving: boolean;
  }) => (
    <div>
      <span>mock-profile-form</span>
      <span>resume:{value.resumeText}</span>
      <span>saving:{String(isSaving)}</span>
      <button onClick={() => onChange({ resumeText: 'Edited', aboutMe: value.aboutMe })}>trigger-change</button>
      <button onClick={onSave}>trigger-save</button>
    </div>
  ),
}));

import ProfilePage from './page';

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('ProfilePage', () => {
  it('fetches and passes the stored profile into ProfileForm', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ profile: { resumeText: 'Stored resume', aboutMe: 'Stored about' } }),
    }) as unknown as typeof fetch;

    render(<ProfilePage />);

    await waitFor(() => {
      expect(screen.getByText('resume:Stored resume')).toBeInTheDocument();
    });
  });

  it('renders empty values when no profile exists yet', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ profile: null }),
    }) as unknown as typeof fetch;

    render(<ProfilePage />);

    await waitFor(() => {
      expect(screen.getByText('resume:')).toBeInTheDocument();
    });
  });

  it('PATCHes the profile when Save is triggered', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ profile: { resumeText: '', aboutMe: '' } }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<ProfilePage />);
    await waitFor(() => expect(screen.getByText('mock-profile-form')).toBeInTheDocument());

    fireEvent.click(screen.getByText('trigger-save'));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/profile', expect.objectContaining({ method: 'PATCH' }));
    });
  });
});
```

- [ ] **Step 10: Run tests to verify they fail**

Run: `npx vitest run app/profile/page.test.tsx`
Expected: FAIL — `./page` cannot be found.

- [ ] **Step 11: Implement `app/profile/page.tsx`**

```tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import ProfileForm, { type ProfileFormValues } from '@/components/profile/ProfileForm';

const EMPTY_VALUES: ProfileFormValues = { resumeText: '', aboutMe: '' };

export default function ProfilePage() {
  const [values, setValues] = useState<ProfileFormValues>(EMPTY_VALUES);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const loadProfile = useCallback(async () => {
    const res = await fetch('/api/profile');
    const json = await res.json();
    if (json.profile) {
      setValues({ resumeText: json.profile.resumeText ?? '', aboutMe: json.profile.aboutMe ?? '' });
    }
  }, []);

  useEffect(() => {
    loadProfile().finally(() => setIsLoading(false));
  }, [loadProfile]);

  async function handleSave() {
    setIsSaving(true);
    try {
      await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return <div className="p-lg text-body text-ink-subtle">Loading...</div>;
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-lg p-lg">
      <h1 className="text-headline text-ink">Profile</h1>
      <ProfileForm value={values} onChange={setValues} onSave={handleSave} isSaving={isSaving} />
    </main>
  );
}
```

- [ ] **Step 12: Run tests to verify they pass**

Run: `npx vitest run app/profile/page.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 13: Commit**

```bash
git add components/profile app/profile/page.tsx app/profile/page.test.tsx
git commit -m "feat(job-tracker): add profile page with resume upload and about-me"
```

---

### Task 21: Final wiring, manual verification, and project docs

**Files:**
- Modify: `app/layout.tsx`
- Modify: `app/page.tsx`, `app/page.test.tsx`
- Create: `CLAUDE.md`
- Create: `MEMORY.md`

**Interfaces:**
- Consumes: `Board` (Task 17), `AddJobDialog` (Task 18), `Button` (Task 2), `Job` (Task 3) in `app/page.tsx`; nothing new is produced for later tasks — this is the last task of Phase 1.

- [ ] **Step 1: Write the failing tests for the wired-up `app/page.tsx`**

Replace `app/page.test.tsx`:
```tsx
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@/components/board/Board', () => ({
  default: ({ onJobClick }: { onJobClick: (job: { id: number }) => void }) => (
    <div>
      <span>mock-board</span>
      <button onClick={() => onJobClick({ id: 42 })}>trigger-job-click</button>
    </div>
  ),
}));

const pushMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}));

vi.mock('@/components/board/AddJobDialog', () => ({
  default: ({ open, onJobCreated }: { open: boolean; onJobCreated: (job: unknown) => void }) => (
    <div>
      <span>add-job-dialog-open:{String(open)}</span>
      <button onClick={() => onJobCreated({ id: 1 })}>trigger-job-created</button>
    </div>
  ),
}));

import Home from './page';

afterEach(() => {
  pushMock.mockClear();
  vi.restoreAllMocks();
});

describe('Home', () => {
  it('renders the app name and the board', () => {
    render(<Home />);
    expect(screen.getByText('Job Tracker')).toBeInTheDocument();
    expect(screen.getByText('mock-board')).toBeInTheDocument();
  });

  it('opens the Add Job dialog when the Add Job button is clicked', () => {
    render(<Home />);
    expect(screen.getByText('add-job-dialog-open:false')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add Job' }));
    expect(screen.getByText('add-job-dialog-open:true')).toBeInTheDocument();
  });

  it('navigates to the job detail page when a card is clicked', () => {
    render(<Home />);
    fireEvent.click(screen.getByText('trigger-job-click'));
    expect(pushMock).toHaveBeenCalledWith('/jobs/42');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/page.test.tsx`
Expected: FAIL — current `app/page.tsx` has no Board, no Add Job button, no job-click navigation.

- [ ] **Step 3: Implement the wired-up `app/page.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Board from '@/components/board/Board';
import AddJobDialog from '@/components/board/AddJobDialog';
import { Button } from '@/components/ui/button';
import type { Job } from '@/lib/types';

export default function Home() {
  const router = useRouter();
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [boardKey, setBoardKey] = useState(0);

  function handleJobClick(job: Job) {
    router.push(`/jobs/${job.id}`);
  }

  function handleJobCreated() {
    setBoardKey((k) => k + 1);
  }

  return (
    <main className="flex min-h-screen flex-col">
      <div className="flex items-center justify-between px-lg pt-lg">
        <h1 className="text-headline text-ink">Job Tracker</h1>
        <Button onClick={() => setIsAddOpen(true)}>Add Job</Button>
      </div>
      <Board key={boardKey} onJobClick={handleJobClick} />
      <AddJobDialog open={isAddOpen} onOpenChange={setIsAddOpen} onJobCreated={handleJobCreated} />
    </main>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/page.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Implement the top-nav in `app/layout.tsx`**

```tsx
import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import Link from 'next/link';
import './globals.css';

const inter = Inter({ subsets: ['latin'], weight: ['500', '600', '700'], variable: '--font-inter' });
const jetbrainsMono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-jetbrains-mono' });

export const metadata: Metadata = {
  title: 'Job Tracker',
  description: 'A personal job application tracker.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.variable} ${jetbrainsMono.variable} bg-canvas font-sans text-ink antialiased`}>
        <header className="flex h-14 items-center gap-lg border-b border-hairline bg-canvas px-lg">
          <nav className="flex gap-md text-body-sm">
            <Link href="/" className="text-ink hover:text-accent-hover">
              Board
            </Link>
            <Link href="/profile" className="text-ink-muted hover:text-accent-hover">
              Profile
            </Link>
          </nav>
        </header>
        {children}
      </body>
    </html>
  );
}
```

`h-14` is Tailwind's default `3.5rem` (56px) spacing utility, matching the spec's 56px top-nav height exactly with no custom token needed.

- [ ] **Step 6: Run the full test suite**

Run: `npm test`
Expected: every test across all 21 tasks PASSES.

- [ ] **Step 7: Type-check and build**

Run: `npx tsc --noEmit`
Expected: clean.
Run: `npm run build`
Expected: production build compiles with no errors.

- [ ] **Step 8: Manual verification**

Run: `npm run dev`. In the browser, confirm every item in the design spec's Verification section:
- The board loads at `localhost:3000` with 5 empty columns styled per the dark design system (canvas background, surface-1 cards/columns, hairline borders, lavender accent only on the Add Job button).
- Add a job via a real URL — verify fetch → extract → editable preview → confirm creates a card.
- Add a job via pasted text — verify the same preview flow.
- Drag a card across all 5 columns, reload the page, and confirm stage/order persisted.
- Open a card and click Generate Kit — verify all 4 pieces appear and persist after navigating away and back.
- Click Regenerate.
- On the Profile page, upload a resume (PDF and DOCX) and confirm extracted text populates the resume field; edit the about-me blurb and confirm a subsequent kit generation reflects it.
- **Before trusting any of the above generations**: confirm `TEXT_MODEL_SLUG` and `WEB_MODEL_SLUG` in `lib/models.ts` are real, current slugs from OpenRouter's `/api/v1/models` list (per Task 7's warning), and that the `web` plugin actually returns grounded content for the company brief. Update the two constants if not, and re-run the affected tests.

- [ ] **Step 9: Commit the wiring**

```bash
git add app/layout.tsx app/page.tsx app/page.test.tsx
git commit -m "feat(job-tracker): wire up top-nav and board/add-job/profile navigation"
```

- [ ] **Step 10: Create `CLAUDE.md`**

```markdown
# CLAUDE.md

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

## Project Status (Job Tracker)

Job Tracker is a local-only kanban board for tracking job applications: 5 fixed stages
(Wishlist → Applied → Interviewing → Offer → Rejected), add a job by URL or pasted text with an
AI extraction + editable preview step, drag cards between/within stages, and per-job "Generate
Kit" (tailored cover letter, resume bullets, 5 interview questions, a web-search-grounded company
brief) via OpenRouter. SQLite (`better-sqlite3`) is the persistence layer; a one-time Profile
(resume + about-me) is reused by every kit generation. No auth, no hosting — `npm run dev` only.

Full design spec: `docs/superpowers/specs/2026-08-15-job-tracker-design.md`. Full Phase 1
implementation plan (21 tasks): `docs/superpowers/plans/2026-08-15-job-tracker-phase-1.md`.

**Done (Phase 1, all 21 plan tasks):**
- Scaffold (Next.js 15 + TypeScript strict + Tailwind 3 + Vitest), dark theme tokens + shadcn/ui
  primitives, shared domain types, SQLite schema + `lib/db.ts` query functions (jobs, profile,
  job_kits, including transactional stage/position renumbering on move).
- `lib/openrouter.ts` client wrapper, placeholder `lib/models.ts` slugs (**not yet verified
  against OpenRouter's live model list — see Currently Pending**), `lib/prompts.ts` builders,
  `lib/fetchJob.ts` (Readability + html-to-text fallback), `lib/resumeParse.ts` (PDF via `unpdf`,
  DOCX via `mammoth`).
- All API routes: job extraction (no persistence), jobs CRUD + move, kit generate/regenerate
  (`Promise.allSettled`, partial-failure-tolerant) plus per-field autosave PATCH, profile
  read/update, and resume upload.
- Full UI: kanban Board with dnd-kit drag-and-drop and optimistic move, add-job
  input/preview/confirm dialog, job detail page with editable kit sections (debounced autosave),
  profile page with resume upload/paste and about-me.
- Top-nav layout (Board/Profile) wired in `app/layout.tsx`; `app/page.tsx` composes `Board` +
  `AddJobDialog`.

**Currently Pending:**
- **Before any real generation**: verify `TEXT_MODEL_SLUG`/`WEB_MODEL_SLUG` in `lib/models.ts`
  against OpenRouter's live `/api/v1/models` list, and confirm the `web` plugin works against
  `WEB_MODEL_SLUG` — sketch2app's `MEMORY.md` documents having shipped a wrong slug that wasn't
  caught until a whole-branch review; don't repeat that here.
- `.env.local` needs a real `OPENROUTER_API_KEY` (gitignored, not present by default).
- Full manual click-through per the design spec's Verification section has not yet been run by a
  human: add a job via URL, add via pasted text, drag across all 5 columns and confirm persistence
  after reload, Generate Kit end-to-end, Regenerate, resume upload (PDF and DOCX), about-me edit
  reflected in a subsequent generation.
- Everything explicitly out of scope for v1 (deferred, not blocking): hosting/deployment,
  auth/multi-user, model-picker UI, per-section regenerate, archive-vs-delete distinction, light
  mode, citation capture for `company_brief_sources` (deferred — see Task 14's implementation
  note in the plan).
```

- [ ] **Step 11: Create `MEMORY.md`**

```markdown
# MEMORY.md

Running log for the `job-tracker` project. Update this as work happens: what the project is,
what's been done, and what's pending.

## Project Details

Job Tracker is a local-only kanban board for tracking job applications: 5 fixed stages
(Wishlist → Applied → Interviewing → Offer → Rejected), add a job by pasting a URL (fetched and
stripped server-side, with a paste-text fallback if the fetch is blocked) or raw text, an AI
extraction call populates an editable preview form the user confirms before a card is created,
drag cards between/within stages, and a per-job "Generate Kit" button produces a tailored cover
letter, rewritten resume bullets, 5 likely interview questions, and a web-search-grounded company
brief via OpenRouter (`:online`/`web` plugin on the company-brief call only). Results persist per
job and can be edited in place (debounced autosave) or regenerated. A one-time Profile (resume
text — pasted or extracted from an uploaded PDF/DOCX — plus an optional about-me blurb) is stored
once and reused automatically by every kit generation.

Stack: Next.js 15 (App Router), React 19, TypeScript (strict), Tailwind 3 + shadcn/ui, SQLite via
`better-sqlite3` (no ORM, 3 tables: `profile`, `jobs`, `job_kits`), `@dnd-kit/*` for drag-and-drop,
`unpdf`/`mammoth` for resume text extraction, `jsdom`/`@mozilla/readability`/`html-to-text` for
URL-to-readable-text, `zod` for LLM JSON validation, Vitest + Testing Library. Look and feel:
Linear-inspired dark-only design system — canvas `#010102`, surface-1 `#0f1011`, lavender accent
`#5e6ad2` used scarcely, Inter type system, no drop shadows, 8px/12px radius scale. No model-picker
UI — default OpenRouter model slugs are hard-coded in `lib/models.ts` (placeholders — must be
verified against OpenRouter's live model list before real use, mirroring a precedent already
documented in sketch2app's own `MEMORY.md`).

Full design spec: `docs/superpowers/specs/2026-08-15-job-tracker-design.md`. Full implementation
plan (21 tasks): `docs/superpowers/plans/2026-08-15-job-tracker-phase-1.md`.

## Steps Completed

- 2026-08-15 — Brainstormed and wrote the Phase 1 design spec (product requirements, Linear-
  inspired dark visual design system adapted from a marketing-site source, SQLite schema, library
  choices, route structure, component structure, data flow). Approved.
- 2026-08-15 — Wrote the Phase 1 implementation plan (21 bite-sized TDD tasks: scaffold → theme
  tokens/shadcn → shared types → SQLite schema + jobs queries → profile/job_kits queries →
  OpenRouter client → model slugs → prompt builders → URL fetch/extract → resume PDF/DOCX parsing
  → extraction route → jobs list/create routes → job detail/edit/move/delete route → Generate Kit
  route → profile routes → JobCard/Column → Board with dnd-kit → add-job dialog/preview form →
  job detail page + kit sections with autosave → profile page → final wiring + docs).
- 2026-08-15 — Executed Phase 1 implementation Tasks 1-20 (scaffold through the profile page),
  each with its own failing-test-first TDD cycle, `npm test` and `tsc --noEmit` clean at every
  task boundary.
- 2026-08-15 — Task 21: wired the top-nav (`app/layout.tsx`) and the Board/Add-Job/job-detail
  navigation in `app/page.tsx`; set up this `CLAUDE.md` and `MEMORY.md`.

## Currently Pending

- Verify `lib/models.ts`'s `TEXT_MODEL_SLUG`/`WEB_MODEL_SLUG` against OpenRouter's live
  `/api/v1/models` list, and confirm the `web` plugin works against `WEB_MODEL_SLUG`, before
  relying on any real generation.
- Create `.env.local` with a real `OPENROUTER_API_KEY` (gitignored).
- Run the design spec's manual Verification checklist end-to-end in the browser (add job by URL,
  add by paste, full drag-and-drop-then-reload check, Generate Kit + Regenerate, resume upload
  PDF/DOCX, about-me affecting a later generation).
- Decide when/whether to merge `job-tracker-phase-1` into `main`.
```

- [ ] **Step 12: Commit**

```bash
git add CLAUDE.md MEMORY.md
git commit -m "docs(job-tracker): add CLAUDE.md and MEMORY.md documenting Phase 1"
```

---

## Self-Review Notes

**Spec coverage:** Walked every section of `docs/superpowers/specs/2026-08-15-job-tracker-design.md`
against the 21 tasks.
- Board (5 fixed columns, drag/reorder) — Tasks 16-17.
- Add-a-job (URL fetch+strip+fallback, AI extraction, editable preview before creation) — Tasks
  9, 11, 18.
- Job detail (view/edit fields, Generate Kit) — Task 19.
- Generate Kit (4 outputs, persisted per-field, partial-failure tolerant, Regenerate) — Tasks 14,
  19.
- Profile (paste/upload resume into the same field, about-me, reused by every generation) — Tasks
  15, 20.
- No model picker / hardcoded, must-verify slugs — Task 7, reiterated in Task 21's manual
  verification step.
- No auth, no hosting, local-only — Global Constraints, Task 1 scaffold.
- Hard-delete-with-confirm — Task 19 (`JobHeader`'s confirm dialog).
- SQLite schema (verbatim 3 tables), integer-position renumbering in a transaction — Global
  Constraints, Task 4.
- Library choices table — `better-sqlite3` (Task 4), dnd-kit (Task 17), `unpdf`/`mammoth` (Task
  10), fetch+jsdom+Readability+html-to-text (Task 9), zod (Task 11).
- Route list — every route in the spec's Routes block maps 1:1 to Tasks 11-15, including the
  `runtime = 'nodejs'` requirement.
- Component list — every component in the spec's Components block maps 1:1 to Tasks 16-20.
- Data flow (a) add-job and (b) generate-kit — traced step-by-step against Tasks 9/11/12/18 and
  14/19 respectively; both match.
- Verification section — every manual-check bullet is reproduced verbatim as a checklist in Task
  21, Step 8.
- Visual design tokens (colors/typography/spacing/radius/elevation) — Global Constraints (copied
  verbatim from the spec) + Task 2 (Tailwind config) + applied throughout every component task's
  className usage.

One gap found and fixed during review: the original Task 18 draft dropped `extraFields` on the
floor between extraction and job creation (`AddJobDialog`'s confirm POST didn't include it even
though the extraction response returns it). Fixed by adding `extraFields` state to `AddJobDialog`
and including it in the `POST /api/jobs` body.

**Placeholder scan:** Grepped the draft for `TBD`, `TODO`, `similar to Task`, `add appropriate`,
`handle edge cases`, and stray ellipses. Every hit was either JS object-spread syntax (`...`) or
example prose text inside a mock/test string (e.g. `'Dear hiring manager...'` as sample generated
content) — no actual placeholder content. Every test step has real assertions; every
implementation step has complete, runnable code.

**Type consistency:** Verified function/type names stay identical everywhere they cross a task
boundary: `createJob`/`getJobs`/`getJob`/`updateJob`/`deleteJob`/`getProfile`/`upsertProfile`/
`getKit`/`upsertKitField` (Tasks 4-5) are imported and called with those exact names in Tasks
12-15, 19; `KitField`'s four string values (`cover_letter`, `resume_bullets`,
`interview_questions`, `company_brief`) are the same set used in Task 5's `upsertKitField`, Task
14's `Promise.allSettled` task list, and Task 19's `PATCH` handler's `EDITABLE_FIELDS`;
`callOpenRouter`'s `{ model, messages, plugins?, responseFormat? }` shape is identical in Tasks 11
and 14; `TEXT_MODEL_SLUG`/`WEB_MODEL_SLUG` (Task 7) are used by name (never redefined or
re-aliased) in Tasks 11, 14, 19; `ExtractedJobFormValues` (Task 18) is imported by name into Task
19's job-detail edit mode rather than redefined; `Job`/`JobKit`/`Profile`/`Stage`/`STAGES` (Task 3)
are the sole source of these types everywhere else in the plan.

**Judgment calls made while decomposing the spec into tasks:**
1. The spec's Data flow section says kit-section edits autosave via a debounced `PATCH
   /api/jobs/[id]/kit`, but the Routes block only specifies `POST` for that path. Task 14 built
   only `POST` (Generate/Regenerate, matching the Routes block literally); Task 19 adds the
   `PATCH` handler the Data flow section requires, once the autosave UI that needs it exists.
2. `company_brief_sources` is documented as "if returned" in the schema — since `lib/openrouter.ts`
   (Task 6) intentionally returns only the message content string (a simpler, consistently-typed
   contract reused by both the extraction and kit routes), citation metadata from the `web` plugin
   isn't captured in Phase 1. The column stays `null`; this is called out explicitly in Task 14 as
   a documented v1 scope decision, not a bug.
3. `Column` (Task 16) is extended in Task 17 with an optional `renderJob` prop so `Board` can swap
   in a drag-enabled card wrapper per-item without `Column`/`JobCard` needing any dnd-kit
   awareness — keeps Task 16's components genuinely presentational per the task breakdown's intent
   while still letting Task 17 own all drag-and-drop wiring.
