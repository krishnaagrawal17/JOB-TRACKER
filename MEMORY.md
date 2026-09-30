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
- 2026-08-16 — Task 21: wired the top-nav (`app/layout.tsx`) and the Board/Add-Job/job-detail
  navigation in `app/page.tsx`; verified `TEXT_MODEL_SLUG`/`WEB_MODEL_SLUG`
  (`anthropic/claude-sonnet-5`) against OpenRouter's live `/api/v1/models` list — real, current
  slug with `web_search` pricing present, no change needed; confirmed `npm test` (171/171),
  `tsc --noEmit`, and `npm run build` all pass clean; appended behavioral guidelines to the
  existing `CLAUDE.md` and created this `MEMORY.md`.
- 2026-09-30 — Phase 2.5: found a substantial, uncommitted multi-user conversion already sitting in
  the working tree on `auth-phase-1` (users table, per-user `jobs`/`profile`, `/register`,
  `getRequestUserId`) with no spec, no plan, and no tests — reversing the earlier "single-user, not
  to be re-litigated" decision. Confirmed with the owner this was intentional, then finished it:
  fixed a real cross-account DoS in `lib/auth/rateLimit.ts` (a global lockout that let one account's
  failed logins lock out every account — now keyed per email), added the missing test coverage
  (`getRequestUserId`, register route, `RegisterForm`, a real assertion in the middleware
  X-User-Id test), deleted the now-orphaned `scripts/set-password.*`, and verified: `tsc --noEmit`
  clean, 283/283 tests across 43 files, `npm run build` green at 14 routes, and a live curl-driven
  end-to-end pass against `npm run dev` (two accounts, job isolation, logout/login, duplicate-email
  409, reproduced-then-fixed the rate-limiter bug). Full detail in `CLAUDE.md`'s "Phase 2.5" section.

## Currently Pending

- Confirm the `web` plugin actually returns grounded content against `WEB_MODEL_SLUG` — the slug
  itself is verified live, but no live OpenRouter call has been made (no `OPENROUTER_API_KEY` in
  this environment) so plugin behavior is unconfirmed until a real key is supplied.
- Create `.env.local` with a real `OPENROUTER_API_KEY` (gitignored).
- Run the design spec's manual Verification checklist end-to-end in the browser (add job by URL,
  add by paste, full drag-and-drop-then-reload check, Generate Kit + Regenerate, resume upload
  PDF/DOCX, about-me affecting a later generation) — deferred from Task 21 for lack of an API key.
- Decide when/whether to merge `job-tracker-phase-1` into `main`.
- **A human browser pass over `/login` and `/register`** (styling, the cross-links between them) —
  the Chrome extension was not connected this session, so Phase 2.5 was only verified via curl, not
  visually.
- **Decide whether `/register` should stay open to anyone who reaches it**, once the app is on a
  public tunnel — flagged but not decided; see CLAUDE.md's Phase 2.5 section.
- `components/SiteHeader.tsx` shows no per-account identity — two logged-in users see an identical
  header. Not built yet.
