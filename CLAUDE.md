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

## PICK UP HERE (next session)

Two things are open, in this order:

1. **The merge decision, which is the user's to make.** Phase 1 is finished and green; nothing has
   been merged or pushed. Present exactly three options and wait: (a) merge back to local `main`,
   (b) push and open a PR — **check the remote first, `origin` points at an unrelated repo**, or
   (c) keep the branch as-is. Do not pick for them.
2. **The manual browser walkthrough**, once `OPENROUTER_API_KEY` exists. See the walkthrough order
   below — it is the only remaining verification, and nothing in this app has ever been exercised
   by a human.

One reversible decision the user may want to revisit: **citations ship dead** (see below). They
were told it's a product call, not an implementation one, and did not respond either way.

The SDD ledger at `.superpowers/sdd/2026-08-15-job-tracker-phase-1/progress.md` holds ~20 `Ruling:`
lines — every decision made without asking, each with its cost-if-wrong. It is **git-ignored**, so
it survives normally on disk but `git clean -fdx` would destroy it. It was deliberately kept rather
than deleted at the end of the plan.

---

**Status: Phase 1 COMPLETE.** All 21 plan tasks done, plus the final whole-branch review and its
fix wave. Branch `job-tracker-phase-1` at `fa47ca3`: **189/189 tests passing across 32 files**,
`tsc --noEmit` clean, `npm run build` succeeds (9 routes emitted). Working tree clean, nothing
merged, nothing pushed — the merge decision is the user's and was still open as of 2026-08-16.

Built via `superpowers:subagent-driven-development`: fresh implementer subagent per task,
task-scoped spec+quality review after each, fix loops on findings, controller ledger at
`.superpowers/sdd/2026-08-15-job-tracker-phase-1/progress.md` (git-ignored). The ledger holds ~20
`Ruling:` lines — every decision made without asking the user, each with its cost-if-wrong. **If
that workspace is gone, git history plus this file are the record.**

**THE APP HAS STILL NEVER BEEN RUN IN A BROWSER.** Everything below is unit-tested and builds, but
no human has clicked through it. `.env.local` needs a real `OPENROUTER_API_KEY` (gitignored, not
present). *Extraction is itself an LLM call*, so without the key no job can be created through the
UI at all — that gates the board, the detail page, and Generate Kit alike. Recommended walkthrough
order when the key arrives, per the final review: (1) add a job via **pasted text** — it validates
`response_format`, fence handling, and the extraction schema in one shot, and nothing else works
until it does; (2) drag a card **down** within a column, then reload — the highest-risk fixed bug;
(3) Generate Kit, and check whether any citations come back at all (see the citations note below);
(4) the rest of the spec's Verification checklist.

**Model slugs are VERIFIED — this is no longer an open risk.** `TEXT_MODEL_SLUG` and
`WEB_MODEL_SLUG` in `lib/models.ts` are both `anthropic/claude-sonnet-5`, confirmed present on
OpenRouter's live `/api/v1/models` (canonical `anthropic/claude-sonnet-5-20260630`, `web_search`
pricing present), independently re-checked by a second agent. Both constants being *identical* is
intentional, not a copy-paste bug. What remains unverified is whether the `web` plugin actually
returns grounded content — that needs the key.

**Citations are structurally dead, by decision.** `company_brief_sources` is always NULL in the
real app: `callOpenRouter` returns only `message.content` and discards the annotations the web
plugin attaches. The column, its `rowToJobKit` parsing, `CompanyBriefSection`'s citation `<ul>`,
and an entire Critical-severity fix round (Task 19) all defend a value nothing ever populates.
Ruled to ship as a documented v1 deferral rather than fixed — comments now sit at
`lib/openrouter.ts`'s return and the company-brief call site so nobody mistakes it for working.
**The user was explicitly flagged that this is reversible and is a product call, not an
implementation one.** Making it real means widening `callOpenRouter`'s return to carry annotations
and threading them through. Root cause worth remembering: the spec promised citation rendering
while specifying a `Promise<string>` client signature that made carrying citations impossible.

Fix rounds that went beyond a plain implement→review pass, worth knowing about: Task 14 needed
zod validation of LLM array output before persisting (the brief's sample skipped it); Task 18
needed error handling and a double-submit guard in the Add Job flow; Task 19 shipped a real
data-loss bug — `PATCH` reused `upsertKitField`, the *generation* writer, so the first autosave on
the company-brief textarea nulled every citation and restamped `*_generated_at` with the edit time
(fixed by adding a content-only `editKitField` to `lib/db.ts`); Task 20 had the same shape — a
failed profile load fell through to a blank editable form whose Save wrote empty strings over the
stored resume (fixed by gating the form behind `loadError`).

**What the final whole-branch review caught that 171 passing tests did not** — the most useful
thing in this file for anyone touching `Board.tsx`:
- **Three separate bugs in one drag handler**, all invisible because `Board.test.tsx` mocks
  `@dnd-kit` wholesale and every drag test dropped on a *column* id, never a sibling card id — so
  the card-to-card path had zero coverage. (a) Downward drags were off by one because the
  destination index was computed against the list with the dragged card removed, while dnd-kit's
  `over.id` indexes the full list; dragging down by exactly one slot hit the no-op early return and
  did *nothing*. (b) Dropping a card on itself fell through the `overIndex === -1` "move to end"
  fallback and sent it to the bottom. (c) `Board`'s initial load had no `res.ok` check, so a dead
  server rendered as five empty columns — indistinguishable from "no jobs yet" on the home screen.
- **Fonts were never actually applying.** `tailwind.config.ts` referenced `var(--font-inter)` from
  Task 2 onward, but nothing *defined* it until Task 21 — every page silently rendered in the
  browser default while Tailwind claimed Inter. Inter was also loaded without weight 400 while
  three type tokens declare 400. Both fixed. Nothing in a unit test can catch this class of bug.
- **Lavender was painted as a background fill** on outline/ghost buttons, the stage badge, and the
  dialog close button — a direct contradiction of the design system's central rule. The correct
  subtle token existed in `globals.css` but was orphaned; now wired as `accent-subtle`.

**Two process lessons if a Phase 2 reuses this plan shape:**
1. Controller-mandated fetch hardening shipped correct-but-untested in Tasks 19 *and* 20 — the
   second time even though the dispatch explicitly named it as the prior task's failure. Put
   hardening tests in the plan's own step list; the directive demonstrably doesn't stick.
2. `Board`'s missing error handling is the same standard's *oldest* gap: the pattern was invented
   at Task 18 and never applied backward to Task 17's code. When a mid-plan review establishes a
   new cross-cutting standard, add an explicit sweep task over everything written before it.
3. When a test must mock the library under test, cover every real branch of the *calling* code.
   That single omission hid all three `Board.tsx` bugs above through 21 tasks of review.

## Where the code lives

- **Own git worktree**: `/Users/krishnaagrawal/Claude-Code/JOB_TRACKER`, linked to the root
  repo at `/Users/krishnaagrawal/Claude-Code`, on branch `job-tracker-phase-1` (branched from
  local `main`, not `origin/main` — the root repo's `origin` remote currently points at an
  unrelated GitHub repo, see the root `CLAUDE.md`'s "Git topology" section before pushing
  anything from here).
- Full app code under `app/`, `components/`, `lib/` — all 21 tasks landed. `MEMORY.md` at the repo
  root is the running project log (project details, steps completed, what's pending).
- **Do not push from here without checking the remote first.** `origin` points at an unrelated
  GitHub repo, so a `git push` would land this branch in the wrong project.

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
- No model-picker UI — `lib/models.ts`'s `TEXT_MODEL_SLUG`/`WEB_MODEL_SLUG` are hard-coded and
  **now verified** against OpenRouter's live `/api/v1/models` list (see Status). Re-verify if they
  are ever changed; sketch2app shipped a wrong slug precisely by skipping this.
- Generate Kit fires 4 OpenRouter calls in parallel (`Promise.allSettled`); a single failure
  must not discard the other three — each field persists independently. Each call now carries a
  120s `AbortSignal.timeout`, and a timeout surfaces as that field's entry in the `errors` map
  rather than hanging the whole request.
- Job deletion is a hard delete with a confirm dialog, no separate archive state.
- Resume paste and resume upload feed the same editable text field, not two separate values.
- V1 regenerates the whole kit at once — no per-section regenerate yet.

## Known-and-accepted issues (triaged at the final review — all SHIP AS-IS)

The final whole-branch review independently triaged every one of these and agreed each can ship.
They are real but not worth blocking on for a single-user localhost app. Do not "discover" them
again — and do not opportunistically fix them without asking, since each was a deliberate call.

- **No danger/error color token exists**, so **12 places** use raw `text-red-400` (the earlier
  count of five in this file was wrong). Consistent everywhere it appears. Adding a `danger` token
  is a cheap follow-up; it is cosmetic.
- **The profile form sits directly on canvas** — no `surface-1` panel, no hairline border, no 24px
  interior padding. Matches its brief's sample verbatim, but not the design system.
- **Kit array fields round-trip lossily**: `resume_bullets`/`interview_questions` split on newline,
  trim each line and drop blanks, so a model-generated bullet containing an embedded newline
  silently becomes two bullets on the user's first edit. Real fix is a list editor — disproportionate
  for v1.
- **Autosave timers aren't flushed on unmount.** Genuinely benign, and here is the reason worth
  keeping: under Next.js client-side navigation the JS context survives unmount, so the `setTimeout`
  still fires and the PATCH still goes out. Only a hard reload or tab close inside the 800ms window
  loses the edit.
- **A11y gaps**: error text has no `aria-live`/`role="status"`, and `aria-label` overrides the
  visible `<label>` on the profile textareas (WCAG 2.5.3).
- **`KitPanel`'s `useState(kit)` never re-syncs with its prop** — a stale-prop trap for whoever adds
  a refresh path, though currently unreachable (the page early-returns until `job` loads, so
  `KitPanel` always mounts with the loaded kit). Note: the "sections' prop-sync effects are
  identity-keyed on arrays" half of this item **was already fixed** in Task 19's refactor —
  `externalValue` is now a plain string, so the effect keys on value, not identity.
- **Board drag race** (Task 17): last-write-wins if a second drag starts before the first PATCH
  resolves. Impractical to hit by hand on localhost; no data corruption, since server-side position
  renumbering stays authoritative. (Distinct from the three drag bugs that *were* fixed — see the
  status section.)
- Smaller ones: `handleRetryLoad` has no re-entrancy guard (GET is idempotent); `editKitField`'s
  `INSERT OR IGNORE` leaves `model_text`/`model_web` NULL if a PATCH ever precedes a generation
  (unreachable via UI, and it's an audit column); body background/color is set twice, via raw CSS
  in `app/globals.css` **and** Tailwind utilities on `<body>` — consistent today, worth
  consolidating whenever `globals.css` is next touched; nav links use `hover:text-accent-hover`,
  slightly outside the design system's "CTA, focus rings, brand mark only" scope for accent, but a
  text color rather than the forbidden background fill.

Non-issues in this context, recorded so they aren't re-raised: `lib/fetchJob.ts` fetches arbitrary
user-supplied URLs server-side with no host allowlist (SSRF — but the "attacker" is the sole local
user; this would change instantly if ever hosted), and job/resume text is interpolated into prompts
with only `"""` delimiters (prompt injection — but output renders as plain text into textareas,
with no tool access and no `dangerouslySetInnerHTML`, so the blast radius is a weird cover letter).

## Behavioral guidelines

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific
instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

### 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

### 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

### 3. Surgical Changes

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

### 4. Goal-Driven Execution

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
