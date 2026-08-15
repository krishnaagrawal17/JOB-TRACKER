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

**Status: planning complete, implementation not yet started.** Design spec brainstormed and
approved via plan mode, then the 21-task implementation plan was drafted, self-reviewed (spec
coverage, placeholder scan, type-consistency pass — one real gap found and fixed: `AddJobDialog`
was dropping `extraFields` on the floor between extraction and job creation), and committed.
Next decision pending: execute via `superpowers:subagent-driven-development` (fresh subagent per
task + review checkpoints — the pattern every other project in this workspace used) or
`superpowers:executing-plans` (inline, batched, with checkpoints).

## Where the code lives

- **Own git worktree**: `/Users/krishnaagrawal/Claude-Code/JOB_TRACKER`, linked to the root
  repo at `/Users/krishnaagrawal/Claude-Code`, on branch `job-tracker-phase-1` (branched from
  local `main`, not `origin/main` — the root repo's `origin` remote currently points at an
  unrelated GitHub repo, see the root `CLAUDE.md`'s "Git topology" section before pushing
  anything from here).
- No app code yet — only `docs/superpowers/specs/` and `docs/superpowers/plans/` exist so far.
  Task 1 of the plan scaffolds the actual Next.js project.

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
