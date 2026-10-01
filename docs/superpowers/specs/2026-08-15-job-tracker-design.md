# Job Application Tracker — Design Spec

## Context

The owner wants a personal job application tracker: a kanban-style
board (Wishlist → Applied → Interviewing → Offer → Rejected) where each job is a card they can
add by pasting a URL or text, drag between stages, and — per card — generate an AI "kit"
(tailored cover letter, rewritten resume bullets, five likely interview questions, a one-page
company brief) using OpenRouter. The goal is to reduce the per-application friction of writing
these artifacts from scratch every time, while keeping a durable, structured view of where every
application stands.

This is a new, standalone project — not part of the existing `sketch2app` app in this workspace,
though it follows similar stack conventions. It lives at
`/Users/krishnaagrawal/Claude-Code/JOB_TRACKER`, its own git worktree on branch
`job-tracker-phase-1` (branched from `main`).

Confirmed via interview: local-only (runs on `localhost`, no hosting/deployment, no auth,
single user), SQLite for durable persistence (not `localStorage`), a one-time stored Profile
(resume + about-me) reused by every generation, URL-fetch-with-paste-fallback for adding jobs,
an editable extraction preview before a card is created, kit results persisted on the card with
a regenerate action, a web-search-enabled OpenRouter model specifically for the company brief
(so it's grounded in real info, not hallucinated), and no model-picker UI — the app just uses
good default models internally.

## Product Requirements

- **Board**: 5 fixed columns — wishlist, applied, interviewing, offer, rejected. Cards draggable
  between columns and reorderable within a column.
- **Add a job**: paste a URL or raw text.
  - URL: fetched server-side and stripped to readable text; if fetching fails/is blocked (e.g.
    LinkedIn), fall back to prompting the user to paste text instead.
  - Either way, an AI call extracts structured fields (title, company, location, description,
    salary/URL if present, plus any other useful fields).
  - Extracted fields are shown in an **editable preview form** — user confirms/edits before the
    card is actually created (not auto-created).
- **Job detail view**: click a card → see/edit its fields, plus a **Generate Kit** button.
- **Generate Kit** produces, per job:
  1. Tailored cover letter
  2. Rewritten resume bullets
  3. Five likely interview questions
  4. A one-page company brief — generated using an OpenRouter web-search-enabled call (`:online`
     plugin) so it reflects real current info about the company, not training-data guesses
  - Results persist on the job record; viewable/editable on return visits; a **Regenerate**
    button re-runs the whole kit. If one of the four calls fails, the other three still save
    (not all-or-nothing).
- **Profile page**: one-time setup — paste resume text and/or upload a PDF/DOCX (text
  auto-extracted into the same editable field), plus an optional "about me" blurb. Stored once,
  reused automatically by every kit generation — never re-entered per job.
- **No model picker**: default OpenRouter model slugs are hard-coded internally (one plain text
  model for cover letter/bullets/questions, one web-search-enabled call for the company brief).
  Slugs must be verified against OpenRouter's live model list before wiring in (sketch2app's
  `MEMORY.md` documents having caught a wrong model slug this exact way).
- **No auth, no hosting**: runs via `npm run dev`, single local user, SQLite file on disk.

**Implementation calls made (not escalated further, per standing preference to decide UX/impl
details directly):**
1. Job deletion is a simple hard delete with a confirm dialog — no separate archive state; the
   Rejected column already serves as a natural soft-archive.
2. Resume paste and resume upload both feed the *same* editable text field (upload extracts text
   into it; user can still hand-edit) rather than being stored as two separate values.
3. V1 only regenerates the whole kit at once, not per-section (e.g. "just redo the company
   brief"). Reasonable future enhancement, not built now.

**Explicitly out of scope for v1**: hosting/deployment, auth/multi-user, model-picker UI,
per-section regenerate, archive-vs-delete distinction, light mode.

## Visual Design System

Krishna supplied a Linear-inspired dark design system (`DESIGN.md` token spec) to use as the
app's visual language. It's written for a marketing site, so several of its components (pricing
cards, testimonials, customer logo marquee, changelog rows, footer link grid) don't apply to a
kanban app and are dropped. The underlying tokens — color, typography, spacing, radius,
elevation, and the applicable component patterns — carry over directly.

**Core tokens** (implement as Tailwind CSS variables / theme extension):

- **Colors**: canvas `#010102` (page background), surface-1 `#0f1011` (cards, panels — job
  cards, columns, dialogs, the kit panel), surface-2 `#141516` (hover/lifted state), hairline
  `#23252a` (1px borders), hairline-strong `#34343a`. Text: ink `#f7f8f8` (primary), ink-muted
  `#d0d6e0` (secondary/meta), ink-subtle `#8a8f98` (tertiary/placeholder). Accent: primary
  `#5e6ad2` (lavender-blue) used **scarcely** — the "Generate Kit" / "Add Job" primary CTA,
  focus rings, and the brand mark only, never as a background fill or decoration. Hover
  `#828fff`, focus `#5e69d1`. Semantic success `#27a644` reserved for a stage/status accent if
  wanted (e.g. an "Offer" badge).
- **Typography**: display sans for headings, text sans for body — Linear's own faces aren't
  public, so substitute **Inter** (weights 500/600/700) for both, and **JetBrains Mono** for any
  monospace use (unlikely to be needed here). Scale: headline 28px/600 (page titles), card-title
  22px/500 (job card title), body 16px/400 (default), body-sm 14px/400 (card meta/labels),
  caption 12px/400 (timestamps, badges), button 14px/500 (all buttons). Negative letter-spacing
  on headings only (roughly -0.4px to -0.6px at these sizes); body stays near 0.
- **Spacing**: 4px base unit — xs 8px, sm 12px, md 16px, lg 24px, xl 32px. Card interior padding
  24px (matches `feature-card`/`product-screenshot-card` spec).
- **Radius**: md 8px for buttons/inputs, lg 12px for cards (job cards, dialogs, the kit panel),
  pill for status badges (stage tags). Never pill-round a button/CTA.
- **Elevation**: no drop shadows — hierarchy comes from the surface ladder (canvas → surface-1 →
  surface-2) plus 1px hairline borders, per the source system. A 2px lavender-focus outline at
  ~50% opacity marks focused inputs/buttons.

**Component mapping to this app** (reusing the source system's patterns, renamed to context):

- `button-primary` → "Add Job", "Generate Kit"/"Regenerate" — lavender fill, white text, 8px
  radius, 8px/14px padding.
- `button-secondary` → "Cancel", "Edit" — surface-1 fill with hairline border.
- `text-input` / `text-input-focused` → URL/text paste field, extraction preview form fields,
  profile textarea, job detail edit fields.
- `feature-card` pattern → **job card** on the board: surface-1 background, hairline border, 12px
  radius, 24px padding (scaled down for card density — board cards likely use a tighter internal
  padding, e.g. 16px, while detail/profile panels use the full 24px).
  `status-badge` → the pipeline-stage tag shown on/near a card (pill, surface-2 background,
  ink-muted text).
- `top-nav` → simple header with two links: Board / Profile. Canvas background, 56px height, no
  wordmark/logo needed (single-user local app).
- Dropped entirely (marketing-only, no equivalent need here): `pricing-card`,
  `pricing-card-featured`, `testimonial-card`, `customer-logo-tile`, `cta-banner`,
  `changelog-row`, `pricing-tab-*`, `footer`.

**Do/Don't carried over**: keep lavender scarce (CTA, focus, accents only — never a section or
card background); no gradients or "spotlight" decoration; no light mode; 8px radius on all
buttons/inputs, 12px on cards; dark canvas throughout (this app ships dark-only, matching the
source system's own stance and Krishna's "clean, modern" brief).

## Technical Architecture

**Stack** (mirrors `sketch2app` conventions for consistency): Next.js 15 (App Router) + React 19
+ TypeScript (strict) + Tailwind 3 + shadcn/ui components (`components.json`: style `default`,
baseColor `slate` swapped to the custom dark palette above, cssVariables) + Vitest (jsdom,
colocated `*.test.ts(x)`) + `lib/utils.ts` `cn()` helper. `.env.local` holds
`OPENROUTER_API_KEY` (gitignored, with `.env.local.example` placeholder) — same pattern as
sketch2app. `next.config.ts` needs `serverExternalPackages: ['better-sqlite3']` so the native
SQLite addon isn't bundled for server routes (Next 15's replacement for the old
`experimental.serverComponentsExternalPackages`).

**Note on OpenRouter web search**: `:online` is a model-agnostic plugin (`plugins: [{ id: 'web',
max_results: 5 }]` in the request body), not a distinct model family — it can be attached to the
same underlying model used for the other three calls, or to a different one. Keep
`TEXT_MODEL_SLUG` and `WEB_MODEL_SLUG` as separate named constants in `lib/models.ts` for future
flexibility, but implementers should know they could collapse to one slug if simpler. **Exact
slugs are placeholders and must be verified against OpenRouter's live `/api/v1/models` list
before wiring in.**

### SQLite schema

Three tables. Generated kit content lives in its own `job_kits` table (1:1 on `job_id`) rather
than as columns on `jobs`, so board-list queries stay lean and partial kit-generation failures
only touch this table.

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

`position` uses simple integer-per-stage with server-side renumbering on move inside a
`better-sqlite3` transaction (not fractional indexing — unnecessary complexity for a single
local user with at most dozens of cards per column).

### Libraries

| Concern | Choice | Why |
|---|---|---|
| SQLite driver | `better-sqlite3`, raw, no ORM | Synchronous, simple; schema is only 3 tables — Drizzle/Prisma would be disproportionate tooling for a solo local app |
| Drag-and-drop | `@dnd-kit/core` + `@dnd-kit/sortable` + `@dnd-kit/utilities` | `react-beautiful-dnd` is archived/unmaintained; dnd-kit is the current maintained standard |
| PDF text extraction | `unpdf` | Actively maintained, clean Node server-route usage; avoids `pdf-parse`'s known eager-execution-on-require issue |
| DOCX text extraction | `mammoth` | Standard `docx → text` extraction |
| URL → readable text | native `fetch` (UA header + timeout) → `jsdom` + `@mozilla/readability`, `html-to-text` as fallback if Readability's output is too short | Readability strips boilerplate well for article-shaped pages; html-to-text fallback covers job postings that aren't article-shaped |
| LLM JSON validation | `zod` (new dependency) | Validates/normalizes structured JSON from extraction + kit calls with safe fallbacks instead of throwing on malformed output |

### Routes

```
app/
  layout.tsx                       — shared top-nav (Board, Profile)
  page.tsx                         — Board (default route)
  jobs/[id]/page.tsx               — Job detail (fields + Kit panel)
  profile/page.tsx                 — Profile (resume + about-me)
  api/
    jobs/route.ts                  — GET (list) · POST (create — confirm step of add-job flow)
    jobs/[id]/route.ts             — GET (detail incl. kit) · PATCH (edit fields / move stage+position) · DELETE
    jobs/extract/route.ts          — POST { url? , text? } → fetch+strip (if url) → AI extraction → returns extracted fields, does NOT persist
    jobs/[id]/kit/route.ts         — POST → runs the 4 OpenRouter calls, persists per-field, doubles as regenerate
    profile/route.ts               — GET · PATCH
    profile/resume/route.ts        — POST multipart (PDF/DOCX) → extract → writes resume_text
```

Follows sketch2app's `app/api/generate/route.ts` precedent: one `POST` handler per feature,
manual body validation, try/catch around OpenRouter calls with normalized `{ error }` responses.
`jobs/[id]/route.ts` and `jobs/[id]/kit/route.ts` need explicit `export const runtime =
'nodejs'` since better-sqlite3/unpdf/mammoth are Node-only. Drag-reorder is folded into `PATCH
/api/jobs/[id]` (`{ stage, position }`, renumbering handled server-side in one transaction)
rather than a separate endpoint.

### Components

```
components/
  board/
    Board.tsx              — DndContext, fetches jobs, renders 5 Columns, onDragEnd → optimistic PATCH
    Column.tsx              — droppable stage column (header + count + card list)
    JobCard.tsx              — draggable card (title/company/location/salary), onClick → job detail
    AddJobDialog.tsx        — 'input' (URL/text) → 'preview' (editable form) → confirm
    ExtractedJobForm.tsx    — editable preview form (reused for job-detail edit mode)
  job-detail/
    JobHeader.tsx, JobDescription.tsx
    KitPanel.tsx              — Generate/Regenerate button, loading + partial-failure state
    CoverLetterSection.tsx, ResumeBulletsSection.tsx, InterviewQuestionsSection.tsx, CompanyBriefSection.tsx
                              — each editable, debounced autosave; CompanyBriefSection renders citation links if present
  profile/
    ProfileForm.tsx, ResumeUpload.tsx (dropzone, same UX pattern as sketch2app's UploadDropzone.tsx)
  ui/                        — shadcn primitives themed to the dark palette above; add dialog, textarea, sonner (toast) via `npx shadcn add`

lib/
  db.ts        — better-sqlite3 singleton + schema init + typed query functions
  openrouter.ts — callOpenRouter({ model, messages, plugins?, responseFormat? })
  models.ts     — TEXT_MODEL_SLUG, WEB_MODEL_SLUG (verify against live OpenRouter list before use)
  prompts.ts    — buildExtractionPrompt, buildCoverLetterPrompt, buildBulletsPrompt, buildQuestionsPrompt, buildCompanyBriefPrompt
  fetchJob.ts   — fetchAndExtractText(url): fetch+UA+timeout, Readability → html-to-text fallback, typed FetchBlockedError
  resumeParse.ts — extractPdfText (unpdf), extractDocxText (mammoth), dispatch by mimetype
  types.ts      — Job, JobKit, Profile, Stage shared types
```

### Data flow

**(a) Add job by URL or text → confirm → persisted card**
1. `AddJobDialog` "input" step: user pastes a URL or raw text.
2. Client `POST /api/jobs/extract` with `{ url }` or `{ text }`.
3. Server: if `url`, `fetchAndExtractText(url)`; on fetch failure/block, returns a typed error →
   client switches to the paste-text tab with a message.
4. Server calls `TEXT_MODEL_SLUG` with the extraction prompt, requesting JSON output; result
   validated/coerced with zod into `{ title, company, location, description, salary,
   source_url, extra_fields }`.
5. Server returns `{ extracted, rawText }` — nothing persisted yet.
6. Client populates `ExtractedJobForm`; user edits; clicks Confirm.
7. Client `POST /api/jobs` with the (possibly edited) fields + `rawText` + appended position.
8. Server inserts the row, returns it; client adds the card to the board.

**(b) Generate Kit → 4 OpenRouter calls → persisted**
1. User clicks "Generate Kit" (same button/endpoint serves "Regenerate") on the job detail page.
2. Client `POST /api/jobs/[id]/kit`.
3. Server loads the job row and the single `profile` row (resume_text + about_me — required
   context for every prompt).
4. Server fires 4 calls via `Promise.allSettled`: 3 against `TEXT_MODEL_SLUG` (cover letter,
   bullets, interview questions), 1 against `WEB_MODEL_SLUG` with the web-search plugin attached
   (company brief).
5. Each settled call upserts its own `job_kits` column(s) individually — one failure doesn't
   discard the other three.
6. Response includes the full kit plus `{ partial, errors }` so the UI can show e.g. "3 of 4
   generated — retry company brief" instead of an all-or-nothing failure.
7. `KitPanel` renders the 4 sections; each autosaves edits via a debounced `PATCH
   /api/jobs/[id]/kit` on blur.

## Verification

- `npm run dev` and confirm the board loads at `localhost:3000` with 5 empty columns styled per
  the dark design system above.
- `tsc --noEmit` clean; `npm run test` (vitest) passing for the query functions, extraction
  parsing, and kit-generation partial-failure handling.
- Manual click-through: add a job via a real URL (verify fetch+extract+preview+confirm), add a
  job via pasted text (verify same preview flow), drag a card across all 5 columns and confirm
  order/stage persist after a page reload, open a card and run Generate Kit end-to-end (verify
  all 4 pieces appear and persist after navigating away and back), hit Regenerate, upload a
  resume (PDF and DOCX) on the Profile page and confirm extracted text populates the field, edit
  the about-me blurb and confirm a subsequent kit generation reflects it.
- Before wiring in `lib/models.ts`, confirm the chosen model slugs exist on OpenRouter's current
  `/api/v1/models` list and that the web-search plugin works against the chosen `WEB_MODEL_SLUG`
  (per sketch2app's documented precedent of catching a wrong slug this way).
