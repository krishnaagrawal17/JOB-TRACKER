# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

A local-only personal job-application tracker: a
kanban board (Wishlist → Applied → Interviewing → Offer → Rejected) where jobs are added by
pasting a URL or text, dragged between stages, and — per job — an AI "kit" (tailored cover
letter, rewritten resume bullets, five likely interview questions, a web-search-grounded
one-page company brief) is generated via OpenRouter and persisted on the card.

Full product/architecture detail: `docs/superpowers/specs/2026-08-15-job-tracker-design.md`
Full implementation plan (21 TDD tasks, 189 steps): `docs/superpowers/plans/2026-08-15-job-tracker-phase-1.md`

## ✅ THE AUTH GATE IS CONFIGURED AND THE APP RUNS. (It was 503 everywhere until 2026-08-18.)

Earlier revisions of this file opened with a warning that every request returned 503. **That is no
longer true as of 2026-08-18**: the password setup was completed, so `AUTH_PASSWORD_HASH` and
`AUTH_SESSION_SECRET` now exist in `.env.local`, `middleware.ts` no longer fail-closes, and the
owner has logged in through a browser. `npm run dev` serves normally.

**`AUTH_PASSWORD_HASH` and `npm run set-password` were retired on 2026-09-30** by the multi-user
conversion — see "Phase 2.5 — multi-user conversion" below. Only `AUTH_SESSION_SECRET` is read now;
per-account passwords live hashed in the `users` table, set via `/register`, not an env var.

If 503s ever return, the cause is almost certainly a missing or malformed auth env var — check that
`.env.local` holds all three keys before suspecting the code.

Still load-bearing: do not "fix" a 503 by weakening or bypassing the gate, and do not add an
`AUTH_ENABLED` flag — its absence is a deliberate design decision (an auth system with an off switch
is how auth ends up off in production). `git checkout main` is Phase 1 with no gate at all, if the
tracker is ever needed without auth.

## PICK UP HERE (next session)

**Update 2026-09-30: the single-user scope described in this section has been superseded.** The app
was converted to multi-user (accounts via `/register`, per-user data) on top of this branch, in an
uncommitted working-tree change that this session found, completed, tested, and verified live. Full
detail: "Phase 2.5 — multi-user conversion" further down. The Task 7 review-still-owed narrative
below is preserved as history (it explains real lessons — R7-1/R7-2/R7-3, the mutation-testing
discipline) but is no longer the next action; nothing here is currently blocked on it.

**Original Task 7 pickup note, kept for history:** work in flight was single-user authentication, on
branch `auth-phase-1` at `fca7a61`. All 7 tasks'
code is now written and committed. **Task 7's code is LANDED but its task-scoped review never
returned a verdict**, so Task 7 has no `Task <N>: complete` line and is not done.

**DO NOT RE-DISPATCH THE TASK 7 IMPLEMENTER.** The code exists and was independently verified by the
controller (details in the Task 7 section below). The *only* outstanding step is the spec+quality
review, and all three artifacts it needs already exist in the workspace:

- brief: `.superpowers/sdd/2026-08-16-job-tracker-auth/task-7-brief.md`
- report: `.superpowers/sdd/2026-08-16-job-tracker-auth/task-7-report.md`
- diff: `.superpowers/sdd/2026-08-16-job-tracker-auth/review-8c60575..fca7a61.diff`

Resume with `superpowers:subagent-driven-development` against
`docs/superpowers/plans/2026-08-16-job-tracker-auth.md`, reading the live ledger at
`.superpowers/sdd/2026-08-16-job-tracker-auth/progress.md` first — tasks with a `Task <N>: complete`
line are done and must not be re-dispatched. Carry rulings R7-1, R7-2 and R7-3 into the review
dispatch. Then: the whole-branch final review over `git merge-base main HEAD`..HEAD on the most
capable available model, pointed at the ledger's deferred-minor and `Ruling:` lines, then
`superpowers:finishing-a-development-branch`.

**Why the review is outstanding: two reviewer dispatches died on API 529 Overloaded and a third was
stopped by the user.** Infrastructure, not verdicts — no work was lost and no finding was reported.

**ASK BEFORE DISPATCHING EACH TASK. This is not a formality and it has already been violated once.**
The user checks in per task and does not want continuous execution. On 2026-08-16 they said
"continue" several times in a row; that was read as standing permission and Task 3 was dispatched
unprompted, drawing the correction "ask me before starting task 3". A short reply approves the task
it names and nothing beyond it — every subsequent task needs its own ask. Prep work (extracting the
task brief, recording BASE, ledger updates) does not need permission; the implementer dispatch
does. There are no implementer dispatches left in this plan, but the same courtesy applies to the
review dispatches and to the merge.

Auth is being added because the app is going onto a tunnel, which invalidates the local-only
assumption.

### Owner setup — DONE on 2026-08-18. Read this before asking the owner to run anything.

The password setup and the local verification were completed on 2026-08-18. **Do not re-run or
re-request them.** What was done, and what it is evidence of:

1. `.env.local` backed up to `~/env-backup` before anything was written.
2. **Password set — but not via the interactive prompt.** `npm run set-password` blocks on hidden
   stdin and hangs any agent that runs it. Instead a small wrapper imported the real script's
   exported `hashPasswordForSetup`, `upsertEnv` and `hasSessionSecret`, with the password supplied
   through `read -s` so it never entered the chat transcript. **Reuse this pattern:** those helpers
   are exported precisely so they can be driven without the prompt, and the script's main-module
   guard means importing it triggers no prompting, no writes and no `process.exit`.
3. Env verified without ever printing a secret: all three keys present exactly once,
   `AUTH_PASSWORD_HASH` well-formed (32-hex salt : 64-hex key), `AUTH_SESSION_SECRET` 64 hex chars,
   `OPENROUTER_API_KEY` byte-identical to the backup. Session-secret preservation on re-run was
   confirmed by calling `hasSessionSecret` against the live file rather than by running the script a
   second time.
4. **`.env.local` was left world-readable (`0644`) by the write and was chmod'ed to `600`.** Root
   cause worth remembering: the script passes `{ mode: 0o600 }` to `fs.writeFileSync`, but **that
   mode applies only when the file is created** — `.env.local` already existed, so it was silently a
   no-op. Anyone touching that script should use an explicit `fs.chmodSync` instead. No test covers
   this, and the failure is invisible.
5. Gate probed by curl against the running dev server: `/` and `/profile` → 307 to `/login?next=…`,
   `/login` → 200, `/api/jobs` → 401 JSON, wrong-password POST → 401.
6. **The owner logged in through a real browser and reported it "working nicely."** The login page
   renders styled, which is the only real check on `config.matcher`'s `_next/static` exclusion.

7. **The open-redirect fix is CONFIRMED in a real browser (2026-08-18).** The owner visited
   `/login?next=https://example.com`, completed the login, and landed on **their own board** — not
   example.com. This is the Critical finding from ruling R6-2, and it is the one manual check that
   genuinely could not be replaced by a test: the malicious input passed all four of
   `safeNextPath`'s original checks and still resolved to the attacker's origin, because WHATWG URL
   parsing strips tab/LF/CR before resolving. **Do not narrow the `/[\x00-\x1F\x7F]/` guard.**

**Not yet confirmed, and each needs a human:** the lockout after six wrong attempts, and that Log
out followed by Back does not restore the board from browser cache.

**The one thing local testing cannot cover:** `npm run build && npm start`, then log in over the
tunnel from a phone. That is the entire reason this phase exists.

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

Current: branch **`auth-phase-1`** at `fca7a61` (all 7 auth tasks' code landed; Task 7's review still
owed), **261/261 tests passing across 41 files**, `tsc --noEmit` clean, `npm run build` green at 13
routes plus a separate 34.6 kB Middleware Edge bundle. **Auth is configured as of 2026-08-18 and the
app runs — the owner has logged in through a browser.** See the setup section above for exactly what
was verified and the three checks still owed.

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

**Scope as originally decided with the user (SUPERSEDED 2026-09-30, kept for history):** single-user,
not multi-user — one password, one board. Friends cannot have their own trackers; multi-user was
explicitly considered and declined (it needs a `users` table, an owner column on all three tables,
and a filter on every query). **That decision was reversed**: a multi-user conversion doing exactly
the previously-declined work (`users` table, `user_id` on `jobs`/`profile`, a filter on every query)
was built and completed — see "Phase 2.5 — multi-user conversion" below. Tunnel, not a VPS, so
SQLite keeps working and the Mac must be awake. Hand-rolled rather than Auth.js, **zero new
dependencies** (still true post-conversion).

**The constraint that shapes the implementation, and the easiest thing to get wrong:** Next.js
middleware runs on the **Edge runtime, which has no `node:crypto`**. So `lib/auth/session.ts` uses
Web Crypto only and is the *sole* auth module middleware may import, while `lib/auth/password.ts`
is Node-only (scrypt) and must never become reachable from it. Both files carry that contract as a
header comment. A violation fails at runtime, not at build time.

**Task order is deliberate: the gate lands last.** Tasks 1–6 leave the app fully usable. Task 7
adds `middleware.ts` and is the moment the app starts demanding a password — after which
`npm run set-password` is mandatory or every request returns 503, by design. There is deliberately
no `AUTH_ENABLED` flag: an auth system with an off switch is how auth ends up off in production.

**Task 1 (session tokens) — complete, `86a6597`**, reviewed clean after one fix round. The fix is
worth remembering: the implementation compiled fine under Vitest but failed `tsc --noEmit`
(`Uint8Array<ArrayBufferLike>` not assignable to `BufferSource`), which would have broken
`npm run build` for the whole app. **Vitest strips types with esbuild without checking them, so a
green test run proves nothing about types.** Run `npx tsc --noEmit` as part of verifying every
remaining task; the controller's own first check missed this by testing but not typechecking.

**Task 2 (password hashing) — complete, `abb0468`**, spec ✅ and quality approved first time, no
Critical or Important findings. scrypt at N=16384/r=8/p=1, 32-byte key, 16-byte random salt,
`timingSafeEqual` for comparison. The reviewer traced every malformed-input path by hand and
confirmed `timingSafeEqual` is reachable only when both buffers are provably 32 bytes, so it can
never throw — worth preserving if that file is ever edited, since `timingSafeEqual` throws rather
than returning false on a length mismatch.

**Task 3 (the `npm run set-password` script) — complete, `b8f0b84`.** Spec ✅ first time, one
Important finding fixed in one round. `scripts/set-password.mjs` plus `scripts/set-password.test.ts`
(7 tests), `.env.local.example` documented, one line added to `package.json`, zero new deps.

**The owner has NOT yet run `npm run set-password`, and Task 7 is unusable until they do.** When
running it: **back up `.env.local` first** (`cp .env.local ~/env-backup`) — it holds the live
`OPENROUTER_API_KEY`. Then perform the brief's Steps 3 and 4 by hand, which no automated test can
substitute for: confirm `OPENROUTER_API_KEY`, `AUTH_PASSWORD_HASH` and `AUTH_SESSION_SECRET` each
appear exactly once and the API key's value is unchanged, then re-run the script and confirm the
session secret is preserved rather than regenerated.

Three things about this task worth not re-deriving:

1. **The scrypt duplication is real but provably safe now (controller ruling PF-1).** The script
   re-implements Task 2's scrypt parameters rather than importing them, because it is plain ESM run
   by `node` and `lib/auth/password.ts` is TypeScript. Drift would write a hash the app cannot
   verify and lock the owner out with no explanatory error. The guard is an *interop* test, not a
   constants comparison: `scripts/set-password.test.ts` asserts
   `verifyPassword(pw, await hashPasswordForSetup(pw))`, and `verifyPassword` recomputes scrypt from
   its own hardcoded parameters — so any drift genuinely fails the test. The reviewer traced this by
   hand and confirmed it. **Preserve that test if either file is ever edited.**
2. **The script must never side-effect on import.** All prompting, file writing and `process.exit`
   sit behind a main-module guard so the test can import `hashPasswordForSetup`, `upsertEnv` and
   `hasSessionSecret` without prompting or writing. An implementer must never *run* the interactive
   script: it blocks on hidden stdin and will hang.
3. **Lesson worth carrying (controller ruling R3-1 and its aftermath):** the brief's only
   verification of the riskiest behaviour — not clobbering the live API key — was a manual terminal
   run no subagent can perform. Substituting unit tests over exported helpers worked, but the first
   attempt hand-copied the session-secret regex into the test instead of importing it, so the real
   code path had zero coverage and the test only proved a copy agreed with itself. That happened
   because the controller's own dispatch offered the hand-copied variant as acceptable. **When
   replacing a manual check with a unit test, the test must call the production code path — an
   exported predicate used by `main()`, never a duplicated literal.**

**Task 4 (login rate limiter) — complete, `b0c7085`.** Spec ✅ on a verbatim transcription of the
brief; one Important finding fixed in one round. `lib/auth/rateLimit.ts` is process-local in-memory
state: 5 attempts, then a 15-minute lockout, with `now` injectable so the tests never touch the real
clock. A server restart clears the lockout, which is deliberate and documented in the file.

Two things about it to carry forward:

1. **The module only self-heals inside `isLockedOut()`.** `recordFailure()` has no time awareness
   and will happily increment a stale counter if called without an intervening `isLockedOut()`
   call. This is safe **only** because Task 5's login route gates on `isLockedOut()` before every
   password check. If that ordering is ever broken, a user who waits out a lockout gets re-locked by
   a single failure. Deferred as a Minor at review, carried explicitly into Task 5's dispatch.
2. **The test that nearly wasn't there.** The brief's five test cases never verified that `failures`
   is reset when the lockout expires — only the boolean `isLockedOut` returns. Deleting
   `failures = 0;` from `rateLimit.ts` left all five passing while turning a lockout into a
   near-permanent one (one post-expiry failure would immediately re-lock for another 15 minutes).
   Ruling R4-1 added a sixth test for that transition, and it was validated by *mutation*: with that
   line deleted, the new test is the only one of the six that fails. **That mutation check is how a
   test defending a side effect should be validated — asserting a return value that is identical
   either way proves nothing.**

**Task 5 (login + logout API routes) — complete, `824c32c`.** Spec ✅ and quality approved first
time, no Critical or Important findings, no fix round. `POST /api/auth/login` and
`POST /api/auth/logout`, both `runtime = 'nodejs'`, 10 new tests.

- **The `isLockedOut()` call is the first statement in the login handler and must stay there.** Two
  independent reasons: it is what makes a lockout return 429 even for a *correct* password, and
  `rateLimit.ts` clears an expired lockout only as a side effect inside that call. The reviewer
  confirmed no code path reaches `recordFailure()` without passing it first, which closes Task 4's
  carried-forward concern.
- **Rate-limit boundary, traced by hand and matching the spec:** wrong attempts 1–5 each return
  401 (the 5th sets the lockout but has already returned its 401); the 6th, and any attempt while
  locked out *including a correct password*, returns 429.
- Two controller rulings extended the brief here: **R5-1** added `logout/route.test.ts`, which the
  brief omitted entirely — the logout route's whole job is invalidating the cookie, so it cannot
  ship untested. **R5-2** extended the fail-closed test to a missing `AUTH_SESSION_SECRET`, since
  the route checks both env vars in one condition.
- **Worth knowing: R5-2 bought less than intended.** The reviewer showed that deleting the
  `if (!hash || !secret)` guard would still crash downstream (`split(':')` on undefined) and still
  surface as a 500, so both fail-closed tests would probably still pass. They document intent but
  do not defend the guard. The Task 4 lesson applies — a test defending a guard should be validated
  by mutation, and an added test file should have its own RED capture mandated (the logout test
  never got one).

**Task 6 (login page + header logout) — complete, `0b804a3`.** `components/LoginForm.tsx`,
`app/login/page.tsx`, `components/SiteHeader.tsx`, their tests, and `app/layout.tsx` rewired to use
`SiteHeader`. Two rounds: one plan defect, one Critical security finding. **This task produced the
most important security fix of the phase — read the second item.**

1. **A plan defect: the brief's own test could not pass against the brief's own component.** The
   double-submit test re-queried the button by accessible name for its second click, but the label
   becomes "Logging in…" while in flight and `/log in/i` does not match that ("logg" never gives
   `log` + space + `in`). Ruling **R6-1** fixed the *test*, not the component — capture the button
   reference before submitting and click that, per `AddJobDialog.test.tsx`'s existing pattern, plus
   assert it is disabled. Caveat recorded honestly: the ruling's stated rationale that this
   "exercises both guards" was **wrong**. `userEvent` suppresses clicks on a disabled control, so
   `handleSubmit`'s `if (submitting) return` is never re-entered. The added `toBeDisabled()`
   assertion is what defends `disabled={submitting}`; the early return is defended by nothing and is
   reachable only via the untested Enter-key submit path.
2. **`safeNextPath` shipped with an exploitable open redirect, inherited verbatim from the brief.**
   Its four checks did not reject control characters. `?next=%2F%09%2Fevil.com` arrives as
   slash-TAB-slash-`evil.com`, passes all four (truthy, starts with `/`, not `//`, no backslash),
   and then `new URL(...)` resolves it to `https://evil.com/` — because **WHATWG URL parsing strips
   tab/LF/CR before resolving**. The router then takes its external-URL path and performs a
   full-page navigation. Send the owner a `/login?next=…` link, they log in, they land on the
   attacker's site — the exact attack the function's own comment claimed to defend, on the app whose
   entire reason for this phase is going onto a public tunnel. Ruling **R6-2** fixed it wider than
   the three reported characters: the new **first** check is
   `if (value && /[\x00-\x1F\x7F]/.test(value)) return '/';`, rejecting all of C0 plus DEL.
   **Do not narrow this back to `\t\n\r`.** The re-review's residual sweep confirmed nothing else
   survives: percent-decoding happens before the function sees the value, double-encoding fails
   `startsWith('/')`, space is not stripped the way tab/LF/CR are, and Unicode solidus look-alikes
   are not path separators in the URL state machine.

**The process lesson this task paid for, twice:** a test only counts if it fails when the thing it
defends is removed. Both this task's new tests and Task 4's were validated by *mutation* — revert
the guard, watch the test go red, restore it. Task 5's fail-closed tests were not, and the reviewer
showed they would pass with the guard deleted. Do this for any test defending a guard or a side
effect.

**Task 7 (the middleware gate) — code landed, `fca7a61`; REVIEW STILL OWED.** `middleware.ts` (41
lines) + `middleware.test.ts` (11 tests), 114 added lines, nothing else touched. This is the commit
that locks the app. Gates every path except `/login`, `/api/auth/login` and `/api/auth/logout`: a
valid session passes through, an unauthenticated **page** request 307-redirects to
`/login?next=<path>`, an unauthenticated **API** request gets 401 JSON, and a missing
`AUTH_SESSION_SECRET`/`AUTH_PASSWORD_HASH` returns **503** rather than falling through.
`middleware.ts` is a verbatim transcription of the brief's code, so any defect found in it later is
plan-mandated.

**Its task-scoped spec+quality review never ran** — two dispatches died on API 529 Overloaded and a
third was stopped by the user. No verdict, no findings, nothing lost. That review is the single
outstanding item in the whole plan.

What the controller verified independently, so it does not need redoing:

- Exactly 2 new files, +114/-0, tree clean; `package.json`, the lockfile and `lib/auth/*` untouched.
- `tsc --noEmit` clean; **261/261 across 41 files** (250 prior + 11 new, confirming R7-1 landed).
- `npm run build` green. The route table still shows **13 routes** — the implementer's report claims
  "12 routes", which is wrong but harmless: 12 was the `Generating static pages (12/12)` count. No
  route was lost. Don't re-investigate this.
- **The Edge/Node import boundary was traced BY HAND, not inferred from the green build**, because a
  violation fails at runtime rather than build time. `middleware.ts` has exactly two imports
  (`next/server`, `@/lib/auth/session`) and `lib/auth/session.ts` still has **zero** imports of its
  own, so the graph is closed. The build also emits a separate `ƒ Middleware 34.6 kB` bundle, which
  is the positive signal that it compiled for Edge.
- **Both mandated mutations were reproduced by the controller**, not taken on trust: deleting the
  `if (!secret || !hash)` block gives `1 failed | 10 passed` with the only casualty being "fails
  closed when auth is not configured"; moving the env check above the `PUBLIC_PATHS` passthrough
  gives `1 failed | 10 passed` with the only casualty being "still lets /login through when auth is
  not configured". Each guard is defended by exactly one test and each test dies when its guard
  goes. `middleware.ts` was restored byte-identical afterwards.

Three rulings extended the brief here:

1. **R7-1 — added an 11th test** asserting `/login` returns 200 when **both** auth env vars are
   absent. The brief checks `PUBLIC_PATHS` *before* the fail-closed env check, and that ordering is
   load-bearing: reverse it and `/login` itself 503s, so an owner who has not run
   `npm run set-password` can never reach their own login page and has no in-app recovery. All 10 of
   the brief's own tests pass under **either** ordering, because the public-path cases run with both
   env vars set. **Do not reorder those two checks, and do not delete that test.**
2. **R7-2 — mandated mutation validation** of both guards as reported evidence rather than a
   directive, applying the lesson Tasks 4 and 6 paid for and Task 5 skipped.
3. **R7-3 — downgraded the task reviewer** from the most capable tier to standard after the two
   529s, rather than retry the same tier a third time. Justified by diff size (114 lines, verbatim
   transcription) and by the risk already discharged through the hand-traced import boundary and
   reproduced mutations. **Mitigation the next session must honour: point the whole-branch final
   review at this ruling explicitly**, since it re-examines this exact diff on the most capable
   model and is where a missed subtlety would surface.

### Deferred minors awaiting the final whole-branch review (Tasks 3–7)

Recorded here because they otherwise live **only** in the git-ignored ledger, which `git clean -fdx`
would destroy. The final review must triage which of these block a merge; none were judged
blocking at task level.

- **Task 3:** `set-password.mjs` calls `main()` with no `await`/`.catch()`, so a rejection surfaces
  as an unhandled promise rejection rather than a clean exit. Same shape as the brief's original.
- **Task 3:** the `set-password` entry sits after `test` in `package.json` rather than grouped —
  purely stylistic.
- **Task 5:** `login/route.ts` — a literal `null` JSON body does not throw in `request.json()`, so
  the try/catch misses it and `body.password` throws a `TypeError`, giving Next's default 500
  instead of the route's own 400. Plan-mandated, untested path, only the app's own login page posts
  there.
- **Task 5:** the two fail-closed tests have weak mutation-kill strength — deleting the
  `if (!hash || !secret)` guard would still crash downstream and still surface as 500, so they would
  likely pass anyway. They document intent but do not defend the guard.
- **Task 5:** no independent RED capture for the mandated logout test file; only the login file's
  RED was recorded.
- **Task 5:** `route.ts`'s JSON-parse `catch` (malformed syntax → 400) has no test.
- **Task 5:** the `secure` cookie attribute is unasserted in both route test files.
- **Task 5, architectural, not fixable there:** logout clears the cookie client-side only. Sessions
  are stateless signed tokens with no server-side revocation, so a copied token stays valid until
  its own expiry regardless of logout. Inherent to the Task 1 design.
- **Task 6:** the double-submit test exercises only the `disabled` attribute, not `handleSubmit`'s
  `if (submitting) return`, which is reachable solely via the untested Enter-key submit path.
- **Task 7:** the redirect writes only `pathname` into `next` (`middleware.ts:39`), silently dropping
  the query string — an unauthenticated hit on `/jobs/12?tab=kit` returns to `/jobs/12`. Spotted at
  pre-flight and deliberately left alone: it is the brief's own code, it is *more* conservative than
  `safeNextPath` (which does accept `/jobs/12?x=1`), and widening it would put attacker-influenceable
  query text back into the redirect that Task 6's Critical finding was about. Fix only with that
  trade-off in mind.
- **Task 7:** `config.matcher` (`middleware.ts:11-13`) has **no test at all**. Nothing verifies the
  `_next/static`/`_next/image`/`favicon.ico` exclusions, and a unit test asserting the literal
  against itself would prove nothing — so the only real check is visual: does `/login` render styled
  when logged out. Left to manual verification on purpose.
- **Task 7, process:** the task-scoped spec+quality review never returned a verdict (two 529s, then
  stopped). The whole-branch final review is therefore the *first* independent review this diff gets.
  Weigh it accordingly, and see ruling R7-3.

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

## Phase 2.5 — multi-user conversion (COMPLETE, 2026-09-30)

**This reverses the "single-user, not multi-user, not to be re-litigated" decision above.** The
code for it was found already written and uncommitted in the working tree at the start of this
session — no spec or plan document exists for it, so unlike every other phase in this project it did
not go through `superpowers:brainstorming` → `writing-plans` → `subagent-driven-development`. This
session confirmed with the owner that the direction was intentional, then completed, tested, and
verified it rather than writing a retroactive spec for already-built code.

**What changed:**
- New `users` table (`id`, `email` UNIQUE COLLATE NOCASE, `password_hash`, `created_at`). `jobs` and
  `profile` each gained a `user_id` column (`REFERENCES users(id) ON DELETE CASCADE`), added via a
  catch-and-ignore `ALTER TABLE` migration in `initSchema` for pre-existing DBs.
- Every `lib/db.ts` query function for jobs/profile/kits now takes `userId` and filters or joins on
  it — `getJobs`, `getJob`, `createJob`, `updateJob`, `deleteJob`, `getProfile`, `upsertProfile`,
  `getKit`, `upsertKitField`, `editKitField`. `getKit` reaches `user_id` via a join to `jobs` since
  `job_kits` itself has no owner column.
- Every API route (`/api/jobs*`, `/api/profile*`) calls the new `lib/auth/getRequestUserId.ts` to
  read the caller's id from the `X-User-Id` header and passes it into every `lib/db.ts` call.
- `middleware.ts` verifies the session and, on success, forwards the authenticated `userId` to route
  handlers via `X-User-Id` — a header set only by middleware itself, never by a client, so
  `getRequestUserId` trusts it unconditionally. (Verified live: `NextResponse.next({ request:
  { headers } })` encodes this as `x-middleware-request-x-user-id` on the response, which is what
  `middleware.test.ts`'s "forwards X-User-Id header" test actually asserts against — see
  `node_modules/next/dist/server/web/spec-extension/response.js`.)
- `lib/auth/session.ts`'s token payload changed from `"{expiresAt}.{hmac}"` to
  `"{userId}:{expiresAt}.{hmac}"` — the whole payload is HMAC'd, so tampering with either field
  invalidates the signature. `verifySession` now returns `{ userId } | null` instead of `boolean`.
- New `POST /api/auth/register` + `/register` page + `components/RegisterForm.tsx`: validates email
  format and an 8-character-minimum password, hashes with the existing Task 2 scrypt path
  (`lib/auth/password.ts`), rejects duplicate emails (case-insensitively, matching the `users.email`
  collation) with 409, and signs a session cookie on success exactly like login does.
  `components/LoginForm.tsx` gained an email field and a "Create one" link to `/register`.
- `npm run set-password` / `scripts/set-password.mjs` (the old single-global-password setup script)
  were **deleted**, along with `scripts/set-password.test.ts`. They implemented the retired
  `AUTH_PASSWORD_HASH` model and had already been removed from `package.json`'s `scripts` before
  this session found the working tree — keeping the files around after that would have been a
  correct-looking script that wrote a value nothing reads anymore.

**One real bug this session found and fixed, not present in the version found in the working
tree:** `lib/auth/rateLimit.ts` was untouched by the original conversion and still had its Phase-2
single-global-counter shape — `isLockedOut()`/`recordFailure()`/`clearFailures()` took no key at
all, and the login route called them with no argument. In a multi-user app that means **one
account's five failed login attempts 429-locks every other account for 15 minutes** — a
cross-account denial-of-service, not merely a missing feature. Fixed by keying the module's map by
normalized (trimmed, lowercased) email, and reordering `login/route.ts` so the lockout check runs
*after* body parsing (it needs the email to key on) but still strictly before `verifyPassword` and
before a session is issued — preserving both of Task 5's original reasons for checking it early
(429s even a correct password while locked out; self-heals expired lockouts as a side effect).
Verified live with curl against the running dev server: account A locked out after 5 wrong
passwords, account B logged in normally in the same window. `lib/auth/rateLimit.test.ts` and
`app/api/auth/login/route.test.ts` both gained a cross-account isolation test for this.

**Test coverage added** (the working tree had zero tests for any of the new files):
`lib/auth/getRequestUserId.test.ts`, `app/api/auth/register/route.test.ts` (10 cases, including the
case-insensitive-duplicate-email path), `components/RegisterForm.test.tsx` (mirrors
`LoginForm.test.tsx`'s existing pattern). `middleware.test.ts`'s pre-existing "forwards X-User-Id"
test was a no-op (comment: "tested via integration" — no such integration test existed); it now
makes a real assertion, per the note above.

**Verified this session:** `tsc --noEmit` clean; **283/283 tests across 43 files** (was 269/41 before
this session: +19 new-file tests, +1 login cross-account test, +2 rate-limit tests, −8 removed
set-password tests); `npm run build` green at 14 routes including `/register` and
`/api/auth/register`. Live end-to-end via curl against `npm run dev` (Chrome extension was not
connected this session, so this is *not* a substitute for a human browser pass): registered two
accounts, created a job under account A, confirmed account B's `/api/jobs` returns `[]` (isolation),
logged A out and back in and confirmed the job persisted, hit the duplicate-email 409 path, and
reproduced + confirmed the fix for the rate-limiter cross-account bug above.

**Still needs a human in a real browser — nothing here substitutes for it:** `/login` and
`/register` rendering styled (same class of risk as every earlier auth-gate check in this file —
`config.matcher`'s exclusions and Tailwind/font loading are not unit-testable); the "Create one" /
"Sign in" links between the two pages; and the actual UX of registering a second real account and
confirming its board starts empty. `SiteHeader.tsx` was **not** touched — it still shows no
per-account identity (email, avatar, a "my account" link), so two logged-in users would see an
identical-looking header. Not a bug, just unbuilt; worth a decision from the owner before this goes
out to anyone but them.

**Open product question, not an implementation one — flagged, not decided:** registration is
currently open to anyone who can reach `/register`, with no invite code, admin approval, or other
gate. Once this app is on a public tunnel, that means anyone who finds the URL can create their own
account and board. That may be exactly the intended point of reversing the single-user decision
(letting friends have their own trackers, which is literally what the original scope note said was
being declined) — but it was not re-confirmed with the owner in those terms, only confirmed that
finishing the already-written multi-user code was wanted. Worth a explicit yes/no before wide
exposure.

The existing SSRF/prompt-injection acceptances under "Known-and-accepted issues" below were reasoned
about under a single-attacker-is-the-owner threat model. Multi-user changes that model: any
registered account can still trigger `lib/fetchJob.ts`'s unrestricted server-side fetch. Not fixed
here — flagging it as a reason to revisit that section if registration stays open to strangers.

**"Forgot password" (email a reset code) — proposed 2026-09-30, NOT built. Do not silently add it;
re-ask first if it comes up again.** The owner asked for a "Forgot password?" button that emails a
reset code. Went through `superpowers:brainstorming` (classified architectural — no existing reset
flow to extend). The one blocking design question was how to actually send email: this app has had
a "zero new dependencies" rule since Phase 2. Options presented: **Resend/SendGrid** (a new external
account + API key, callable via plain `fetch` like `lib/openrouter.ts` already does, no new npm
dependency) or **Gmail SMTP via an App Password** (no new account, but requires adding `nodemailer`
since hand-rolling SMTP is fragile and security-sensitive — the one path that breaks the
dependency rule). The owner chose "use my own email" (Gmail), but on hearing it needs both a
Gmail App Password (a Google Account setting only they can change) **and** the new `nodemailer`
dependency, declined: *"No, leave it. I do not want to do this."* No code was written — the
brainstorming session ended at the design-approval gate, exactly as it's supposed to when the
answer is no. If this is revisited, start from Resend/SendGrid instead of Gmail+nodemailer unless
the owner specifically re-raises the dependency trade-off.

## Where the code lives

- **Its own standalone git repository** at `/Users/krishnaagrawal/Claude-Code/JOB_TRACKER`. It is
  *not* a worktree and has no relationship to the repo at `/Users/krishnaagrawal/Claude-Code` beyond
  sitting inside that folder on disk (where it is gitignored).
- **`origin` = https://github.com/krishnaagrawal17/JOB-TRACKER.git — private.** Pushed 2026-08-18.
  Both `main` and `auth-phase-1` are on the remote and tracking. This is a dedicated repo, **not**
  the Leadership one — see the history note below for why that distinction matters.
- Full app code under `app/`, `components/`, `lib/` — all 21 tasks landed. `MEMORY.md` at the repo
  root is the running project log (project details, steps completed, what's pending).

### Repo history (2026-08-16) — why this repo has its own dedicated remote

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
removed deliberately so this repo could not push into Leadership. That was honoured: the remote added
on 2026-08-18 is a new, dedicated repo (`JOB-TRACKER`). **Never point this repo at the Leadership one.**

### The GitHub push — DONE 2026-08-18

Pushed to **https://github.com/krishnaagrawal17/JOB-TRACKER**, **private**. Private because the
design docs describe the owner's personal job search; it can be flipped public later, which is not
reversible in the other direction. **The "non-technical job seeker" phrasing was removed on
2026-10-01** from this file's opening line and from the design spec's Context section — it was not
what a hiring manager should read alongside the code, and the repo is a portfolio piece. Do not
reintroduce it.

**The git identity was fixed by rewriting history before the push, and must not be re-litigated.**
All commits had been authored to `krishnaagrawal@Krishnas-MacBook-Air.local` and
`…-Air-2.local` — addresses git invented from the machine name, which GitHub cannot link to an
account. Left alone, none of this work would have appeared on the owner's profile, which matters
because they are job hunting and this is a portfolio piece.

- **Identity now used:** `Krishna Agrawal <302115059+krishnaagrawal17@users.noreply.github.com>`,
  set **locally in this repo only** (`git config user.email`), not globally.
- **Why the noreply alias rather than a real address:** the owner's GitHub account email differs
  from the address on file elsewhere, and the alias is *owned by* account `krishnaagrawal17`
  (numeric id `302115059`), so attribution is certain. A real email only links if it is verified on
  the account, and a typo would silently leave every commit unattributed. It also keeps the owner's
  address off a repo that may go public.
- **All 64 commits were rewritten** with `git filter-branch --env-filter` over `main` and
  `auth-phase-1`, before anything was pushed — the cheap moment to do it. Verified afterwards:
  zero remaining `.local` authors, `main`'s tree byte-identical to its pre-rewrite backup, and
  `main` still an ancestor of `auth-phase-1`.
- **Local safety branches `backup-before-rewrite-main` and `backup-before-rewrite-auth`** hold the
  original pre-rewrite history. They were deliberately **not** pushed. Safe to delete once the
  remote has been eyeballed.
- **Other projects in this workspace are unaffected** — `sketch2app`, `Leadership` and
  `model_council` still author commits to the machine-name address, because the fix was per-repo.
  `model_council` is already pushed, so fixing it would need a force-push. Not done; the owner's
  call.

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
