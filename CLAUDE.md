# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

A local-only personal job-application tracker for Krishna (non-technical job seeker): a
kanban board (Wishlist → Applied → Interviewing → Offer → Rejected) where jobs are added by
pasting a URL or text, dragged between stages, and — per job — an AI "kit" (tailored cover
letter, rewritten resume bullets, five likely interview questions, a web-search-grounded
one-page company brief) is generated via OpenRouter and persisted on the card.

Full product/architecture detail: `docs/superpowers/specs/2026-08-15-job-tracker-design.md`
Full implementation plan (21 TDD tasks, 189 steps): `docs/superpowers/plans/2026-08-15-job-tracker-phase-1.md`

**Status: implementation in progress via `superpowers:subagent-driven-development`.** Design spec
brainstormed and approved via plan mode, then the 21-task implementation plan was drafted,
self-reviewed (spec coverage, placeholder scan, type-consistency pass — one real gap found and
fixed: `AddJobDialog` was dropping `extraFields` on the floor between extraction and job
creation), and committed. Execution started 2026-08-15: fresh implementer subagent per task,
task-scoped spec+quality review after each, fix loops on findings, controller ledger at
`.superpowers/sdd/2026-08-15-job-tracker-phase-1/progress.md` (git-ignored — the git history is
the durable record once the plan finishes).

As of this writing, **Tasks 1-20 of 21 are complete** (full backend/data layer — scaffold, theme,
types, SQLite, OpenRouter client, all 6 API routes — plus `JobCard`/`Column`/`Board` with dnd-kit
drag-and-drop, the `AddJobDialog`/`ExtractedJobForm` "Add Job" flow, the job detail page with its
autosaving kit panel, and the profile page). Verified at Task 20's close: `tsc --noEmit` clean,
169/169 tests passing across 32 files. Remaining: **Task 21 only** (final wiring + manual
verification). The user asked to check in after each task rather than running the whole plan
continuously, so this file's status line will lag slightly behind the ledger between sessions —
check the ledger or `git log` for the exact current task.

**Nothing is reachable in a browser yet.** The detail page and profile page are built and tested
but nothing links to them — Task 21's Step 1-5 wiring (top-nav in `app/layout.tsx`, `Board`'s
`onJobClick` → `/jobs/[id]` in `app/page.tsx`) is what connects them. `npm run build` has also
never been run on this project; unit tests say nothing about whether the `better-sqlite3` native
addon survives a production build via `serverExternalPackages`.

**Blocked on a key the user will supply later:** every OpenRouter-dependent path in Task 21's
manual walkthrough. Note that *extraction itself is an LLM call*, so no job can be created
through the UI at all without `OPENROUTER_API_KEY` — that blocks exercising the board and detail
page with real data, not just Generate Kit. The `/api/v1/models` slug check is a public endpoint
and needs no key; only confirming the `web` plugin returns grounded content does.

**Watch out — Task 21's Step 10 says "Create `CLAUDE.md`"** with generic anti-LLM-mistake
boilerplate. This file already exists and is the durable cross-session status record. Merge that
content in as a section; do not let the task overwrite this file.

Four fix-loop rounds so far went beyond a plain implement→review pass and are worth knowing about:
Task 14 (Generate Kit) needed a fix to zod-validate LLM array output before persisting it (the
brief's own sample code skipped this); Task 18 needed a fix for unhandled fetch failures and a
double-submit guard in the primary Add Job flow; Task 19 shipped a real data-loss bug — `PATCH`
reused `upsertKitField`, the *generation* writer, so the first autosave on the company-brief
textarea nulled every web-search citation and restamped `*_generated_at` with the edit time (fixed
by adding a content-only `editKitField` to `lib/db.ts`); Task 20 had the same shape — a failed
profile load fell through to a blank editable form whose Save wrote empty strings over the stored
resume (fixed by gating the form behind `loadError`). All are documented with full rulings in the
SDD ledger.

**A pattern the reviews kept catching:** in Tasks 19 *and* 20, controller-mandated fetch hardening
shipped with the code correct but a third of it untested — the second time even though the
dispatch explicitly named it as the prior task's failure. Both were caught in review and closed in
one fix round, so nothing shipped broken, but if a Phase 2 reuses this plan shape, put the
hardening tests in the plan's own step list rather than in a controller directive. The directive
demonstrably doesn't stick.

## Where the code lives

- **Own git worktree**: `/Users/krishnaagrawal/Claude-Code/JOB_TRACKER`, linked to the root
  repo at `/Users/krishnaagrawal/Claude-Code`, on branch `job-tracker-phase-1` (branched from
  local `main`, not `origin/main` — the root repo's `origin` remote currently points at an
  unrelated GitHub repo, see the root `CLAUDE.md`'s "Git topology" section before pushing
  anything from here).
- App code now exists under `app/`, `components/`, `lib/` per Tasks 1-20 (see Status above for
  what's implemented vs. remaining) — this is no longer just `docs/`.

## Stack (per the design spec)

Next.js 15 (App Router) + React 19 + TypeScript strict + Tailwind 3 + shadcn/ui, `better-sqlite3`
(no ORM, 3-table schema: `profile`, `jobs`, `job_kits`), `@dnd-kit` for the board,
`unpdf`/`mammoth` for resume PDF/DOCX extraction, `jsdom` + `@mozilla/readability` +
`html-to-text` for job-URL fetching, `zod` for validating LLM JSON output, Vitest + Testing
Library. Mirrors `sketch2app`'s conventions (OpenRouter client shape, `cn()` helper, API route
error-handling pattern) where the spec calls for it. Visual design follows a Linear-inspired
dark-only token system Krishna supplied — see the spec for exact hex/spacing/radius values.

## Key decisions already made (see the spec for full reasoning)

- Local-only: `npm run dev`, single user, no auth, no hosting.
- No model-picker UI — `lib/models.ts`'s `TEXT_MODEL_SLUG`/`WEB_MODEL_SLUG` are hard-coded
  placeholders that **must be verified against OpenRouter's live `/api/v1/models` list** before
  real use (sketch2app caught a wrong slug exactly this way — don't skip this step).
- Generate Kit fires 4 OpenRouter calls in parallel (`Promise.allSettled`); a single failure
  must not discard the other three — each field persists independently.
- Job deletion is a hard delete with a confirm dialog, no separate archive state.
- Resume paste and resume upload feed the same editable text field, not two separate values.
- V1 regenerates the whole kit at once — no per-section regenerate yet.

## Deferred minors awaiting the whole-branch review

Parked deliberately with rulings in the SDD ledger — real, but not worth a fix round mid-plan.
Task 21's final review is pointed at this list to triage what must be fixed before merge:

- **No danger/error color token exists** in the design system, so five places use raw
  `text-red-400`. Either add a token or accept the exception — but decide it once, centrally.
- **The profile form sits directly on canvas** — no `surface-1` panel, no hairline border, no 24px
  interior padding. Matches its brief's sample verbatim, but not the design system.
- **Kit array fields round-trip lossily**: `resume_bullets`/`interview_questions` split on newline,
  trim each line and drop blanks, so a model-generated bullet containing an embedded newline
  silently becomes two bullets on the user's first edit.
- **Autosave timers aren't flushed on unmount** — navigating away inside the 800ms debounce window
  drops that save. Benign under React 18; the correct fix is flush-on-unmount plus a `mountedRef`,
  *not* a bare `clearTimeout` (which would lose the save outright).
- **A11y gaps**: error text has no `aria-live`/`role="status"`, and `aria-label` overrides the
  visible `<label>` on the profile textareas (WCAG 2.5.3).
- **`KitPanel`'s `useState(kit)` never re-syncs with its prop**, and the sections' prop-sync effects
  are identity-keyed on arrays — both are stale-prop traps for whoever adds the next refresh path.
- **Board drag race** (Task 17): last-write-wins if a second drag starts before the first PATCH
  resolves. Parked as impractical to hit by hand on localhost; no data corruption, since server-side
  position renumbering stays authoritative.
- Smaller ones: `handleRetryLoad` has no re-entrancy guard; `editKitField`'s `INSERT OR IGNORE`
  leaves `model_text`/`model_web` NULL if a PATCH ever precedes a generation (unreachable via UI).
