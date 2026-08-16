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

**Work in flight: single-user authentication, on branch `auth-phase-1`.** Task 1 of 7 is complete
and reviewed; Tasks 2–7 remain. Resume with `superpowers:subagent-driven-development` against
`docs/superpowers/plans/2026-08-16-job-tracker-auth.md`, reading the live ledger at
`.superpowers/sdd/2026-08-16-job-tracker-auth/progress.md` first — tasks with a `Task <N>: complete`
line are done and must not be re-dispatched. **The user's standing preference is to check in after
each task rather than run continuously.**

Auth is being added because the app is going onto a tunnel, which invalidates the local-only
assumption. Tasks 1–6 leave the app fully usable; **Task 7 is the moment it starts requiring a
password**, and `npm run set-password` must have been run by then or every request returns 503 by
design.

Also open, smaller: **push this repo to GitHub** — decided yes, private, but not yet done. Do the
git-identity fix first (below), because it is far cheaper before a push than after.

**Phase 1 itself is finished, merged, verified, and closed.** The merge decision and the browser
walkthrough that dominated earlier handoffs are both resolved — see Status.

One reversible decision the user may want to revisit: **citations ship dead** (see below). This is
now a much better-understood call than it was — a live `web`-plugin request on 2026-08-16 came back
with `url_citation` entries in `message.annotations`, so the data demonstrably arrives and the only
reason `company_brief_sources` is empty is that `callOpenRouter` discards everything but
`message.content`.

The SDD ledger at `.superpowers/sdd/2026-08-15-job-tracker-phase-1/progress.md` holds ~20 `Ruling:`
lines — every decision made without asking, each with its cost-if-wrong. It is **git-ignored**, so
it survives normally on disk but `git clean -fdx` would destroy it. It was deliberately kept rather
than deleted at the end of the plan.

---

**Status: Phase 1 COMPLETE, merged, and VERIFIED BY A HUMAN. Phase 2 (auth) in progress.**

Phase 1: all 21 plan tasks done plus the final whole-branch review and its fix wave, merged to
`main` as a fast-forward on 2026-08-16 at `9474159`. The branch `job-tracker-phase-1` no longer
exists here, having been renamed `main` during the repo split.

Current: branch **`auth-phase-1`** at `86a6597` (1 of 7 auth tasks landed), **201/201 tests passing
across 33 files**, `tsc --noEmit` clean, working tree clean.

Built via `superpowers:subagent-driven-development`: fresh implementer subagent per task,
task-scoped spec+quality review after each, fix loops on findings, controller ledger at
`.superpowers/sdd/2026-08-15-job-tracker-phase-1/progress.md` (git-ignored). The ledger holds ~20
`Ruling:` lines — every decision made without asking the user, each with its cost-if-wrong. **If
that workspace is gone, git history plus this file are the record.**

**THE APP HAS NOW BEEN RUN IN A BROWSER AND WORKS.** On 2026-08-16 the user started it, added a
job, and generated a kit end to end. Verified afterwards by reading the SQLite file directly:
**1 job, 1 job_kit, 1 profile row persisted** — including across an abrupt process kill, which the
WAL handled cleanly. `job-tracker.db` is created on first request; `better-sqlite3` loads and
`initSchema` runs without intervention. This closes the "never exercised by a human" risk that
dominated every earlier handoff.

Also confirmed live in the same session, by direct requests to OpenRouter rather than through the
UI: `response_format: { type: 'json_object' }` returns bare parseable JSON with no fence, and the
`web` plugin returns genuinely current grounded content.

**Two items from the original walkthrough list were NOT explicitly confirmed** and are worth doing
opportunistically, because unit tests cannot cover either: (1) dragging a card **down** within a
column and reloading — the highest-risk of the three drag bugs fixed at the end of Phase 1, and the
one whose failure would silently corrupt card order; (2) the remainder of the spec's Verification
checklist. The user reported the app "working nicely" but did not confirm these specifically.

`.env.local` holds a real `OPENROUTER_API_KEY` and is gitignored, so it exists on disk only — a
fresh clone will not have it, and neither will anyone who pulls this from GitHub.

**Model slugs are VERIFIED — this is no longer an open risk.** `TEXT_MODEL_SLUG` and
`WEB_MODEL_SLUG` in `lib/models.ts` are both **`openai/gpt-5.6-luna`** (changed 2026-08-16 from
`anthropic/claude-sonnet-5`). Both constants being *identical* is intentional, not a copy-paste
bug — they are separate names so the web-grounded call can move independently of the other three.

Verified with **real requests**, not just an `/api/v1/models` lookup, which is the check sketch2app
skipped when it shipped a wrong slug: the slug resolves and echoes back `openai/gpt-5.6-luna`;
`response_format: { type: 'json_object' }` returns bare parseable JSON; and `plugins: [{ id: 'web',
max_results: 5 }]` returns genuinely grounded, current content. **The `web` plugin question is
therefore closed** — it works, and it also returns `url_citation` annotations (see citations below).

The change was driven by cost: a full kit is 4 calls at roughly 20K in / 3K out, about $0.07 on
Claude Sonnet 5 versus about $0.004 on Luna, so an entire job search costs well under a dollar.
Luna is current-generation (2026-07-09) with a 1.05M context window — this is not a downgrade to a
legacy model. If output quality disappoints during the walkthrough, `anthropic/claude-opus-5`
($5/$25 per M) is the quality-first option at roughly $0.18 a kit; both are one-line changes, and
`lib/models.test.ts` asserts only slug *shape*, so no test churn either way. **Re-verify with real
requests if these ever change.**

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

**Update 2026-08-16 — the missing half of this story is now confirmed.** A live `web`-plugin
request returned `message.annotations` containing `url_citation` objects (source `url`, `title`,
and `start_index`/`end_index` offsets into the content). So the annotations genuinely arrive on the
wire, and the only reason `company_brief_sources` is NULL is the client discarding them. That makes
this a bounded, well-understood change rather than an unknown: widen the return type, persist the
annotations, and the column, `rowToJobKit` parsing, and `CompanyBriefSection`'s citation `<ul>` are
all already built and waiting. Still deferred pending the user's product call — but now with
evidence rather than an assumption behind it.

## Phase 2 — single-user authentication (IN PROGRESS)

Spec: `docs/superpowers/specs/2026-08-16-job-tracker-auth-design.md`
Plan: `docs/superpowers/plans/2026-08-16-job-tracker-auth.md` (7 TDD tasks)
Ledger: `.superpowers/sdd/2026-08-16-job-tracker-auth/progress.md` (git-ignored — **read it before
resuming**; it records which tasks are done and every ruling made without asking)

**Why:** the app is going onto a Cloudflare-style tunnel so it is reachable from anywhere. That
directly invalidates the "sole local user" premise behind the accepted SSRF triage in
`lib/fetchJob.ts`. A password gate makes that premise true again instead of merely assumed.

**Scope, decided with the user and not to be re-litigated:** single-user, not multi-user — one
password, one board. Friends cannot have their own trackers; multi-user was explicitly considered
and declined (it needs a `users` table, an owner column on all three tables, and a filter on every
query). Tunnel, not a VPS, so SQLite keeps working and the Mac must be awake. Hand-rolled rather
than Auth.js, **zero new dependencies**.

**The constraint that shapes the implementation, and the easiest thing to get wrong:** Next.js
middleware runs on the **Edge runtime, which has no `node:crypto`**. So `lib/auth/session.ts` uses
Web Crypto only and is the *sole* auth module middleware may import, while `lib/auth/password.ts`
is Node-only (scrypt) and must never become reachable from it. Both files carry that contract as a
header comment. A violation fails at runtime, not at build time.

**Task order is deliberate: the gate lands last.** Tasks 1–6 leave the app fully usable. Task 7
adds `middleware.ts` and is the moment the app starts demanding a password — after which
`npm run set-password` is mandatory or every request returns 503, by design. There is deliberately
no `AUTH_ENABLED` flag: an auth system with an off switch is how auth ends up off in production.

**Task 1 (session tokens) is complete** — `86a6597`, reviewed clean after one fix round. The fix
is worth remembering: the implementation compiled fine under Vitest but failed `tsc --noEmit`
(`Uint8Array<ArrayBufferLike>` not assignable to `BufferSource`), which would have broken
`npm run build` for the whole app. **Vitest strips types with esbuild without checking them, so a
green test run proves nothing about types.** Run `npx tsc --noEmit` as part of verifying every
remaining task; the controller's own first check missed this by testing but not typechecking.

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

- **Its own standalone git repository** at `/Users/krishnaagrawal/Claude-Code/JOB_TRACKER`, on
  branch `main`, with **no remotes configured**. It is *not* a worktree and has no relationship to
  the repo at `/Users/krishnaagrawal/Claude-Code` beyond sitting inside that folder on disk (where
  it is gitignored).
- Full app code under `app/`, `components/`, `lib/` — all 21 tasks landed. `MEMORY.md` at the repo
  root is the running project log (project details, steps completed, what's pending).
- **Before any first `git push`, add a remote deliberately.** There is no `origin` right now, which
  is intentional — see the history note below.

### Repo history (2026-08-16) — why there are no remotes

This project used to be a worktree of `/Users/krishnaagrawal/Claude-Code`, a single repo that also
hosted two unrelated projects: **Leadership** (a Vite app, also at repo root) and **sketch2app** (in
a `sketch2app/` subfolder). All three shared one history whose root commit is literally *"Add design
spec for AI Leadership Tutor"*, and that repo's `origin` pointed at
`github.com/krishnaagrawal17/Leadership.git` — so a `git push` from here would have uploaded the job
tracker into the Leadership GitHub repo. Job Tracker and Leadership also collided on four root
paths (`CLAUDE.md`, `docs`, `package.json`, `tsconfig.json`) and only coexisted because their
branches never met.

The split preserved all 41 commits by swapping in a fresh `.git` rather than copying files, which
kept the gitignored-but-valuable `.env.local` and `.superpowers/` ledger in place. `origin` was
removed deliberately so this repo cannot push into Leadership. **If you add a remote, create a new,
empty GitHub repo for the job tracker — do not reuse the Leadership one.**

### Before the first push to GitHub

Decided: **yes, push it, and make it private.** Private because the design docs describe the
owner's personal job search; it can be flipped public later, which is not reversible in the other
direction. If it does go public, first rewrite `CLAUDE.md`'s opening line — it describes the
project as being for "Krishna (non-technical job seeker)", which is not what a hiring manager
should read alongside the code.

**Fix the git identity first.** Commits are currently authored as
`krishnaagrawal@Krishnas-MacBook-Air.local`, an address git invented from the machine name.
GitHub cannot link that to an account, so none of this work would appear on the user's profile —
which matters, because the user is job hunting and this is a portfolio piece. Setting
`git config user.email` fixes future commits; the existing ones need a history rewrite, which is
**clean to do while nothing has been pushed and nobody else has a copy**, and progressively more
annoying afterwards.

Push safety was verified on 2026-08-16: no `.env.local`, no `*.db` files, and the OpenRouter key
appears in no tracked file and nowhere in the commit history. `.env.local.example` holds only
placeholder text.

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
- No model-picker UI — `lib/models.ts`'s `TEXT_MODEL_SLUG`/`WEB_MODEL_SLUG` are hard-coded, both
  currently `openai/gpt-5.6-luna`, and **verified with real API requests** (see Status). Re-verify
  the same way if they are ever changed; a catalog lookup is not enough, and sketch2app shipped a
  wrong slug precisely by skipping this.
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
