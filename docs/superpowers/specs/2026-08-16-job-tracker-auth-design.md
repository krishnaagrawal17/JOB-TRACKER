# Job Tracker — Single-User Authentication — Design Spec

## Context

The Job Tracker was built local-only: `npm run dev`, one user, no auth, no hosting. That
assumption is recorded throughout `CLAUDE.md` and is load-bearing for at least one accepted
risk — `lib/fetchJob.ts` fetches arbitrary user-supplied URLs server-side with no host
allowlist, which was triaged as safe on the grounds that "the attacker is the sole local user."

The user now wants the app reachable over the internet via a Cloudflare-style tunnel to their
Mac. That invalidates the assumption. This spec adds a **single-user password gate** so the
original threat model holds again: exactly one person can reach the application.

**Decided during brainstorming:**

- **Single-user, not multi-user.** One password, one board. Friends cannot have their own
  trackers; if they had the password they would land in the owner's data. Multi-user was
  explicitly considered and declined — it would require a `users` table, an owner column on all
  three existing tables, and a filter on every query.
- **Tunnel, not a VPS.** The app keeps running on the owner's Mac against local SQLite. HTTPS
  is terminated by the tunnel provider. The Mac must be awake for the site to be reachable;
  this was accepted.
- **Hand-rolled over Auth.js.** Auth.js solves multi-provider OAuth and multi-user sessions.
  This is one password and a signature check. Matches the codebase's existing no-ORM,
  minimal-dependency ethos. **Zero new runtime dependencies.**
- **Application-level, not Cloudflare Access.** Auth in the app travels unchanged to a VPS and
  protects the app itself rather than only the route to it.

### What this protects against, and what it does not

Protects against: anyone who discovers the tunnel URL reading the owner's resume and job
applications, adding or deleting jobs, or spending the owner's OpenRouter credit via Generate
Kit. Restores the "sole local user" premise behind the accepted SSRF triage.

Does **not** protect against: an attacker with read access to the machine or to `.env.local`
(which already holds the OpenRouter key in plaintext), or malware in the owner's browser. Both
are out of scope for a personal tool.

## Product Requirements

1. Every page and every API route requires a valid session. There is no anonymous surface.
2. The owner sets a password once via a setup script. The plaintext password is never stored.
3. Logging in issues a session lasting 30 days, so routine use does not mean constant re-login.
4. A wrong password is rate-limited, because a public URL plus unlimited guesses is a slow
   password crack.
5. Logging out is available from the nav on every page.
6. **The app fails closed.** If auth is not configured, every request is denied — never allowed.

## Technical Architecture

### Configuration

Two new values in `.env.local` (already gitignored; confirmed the file is absent from all 42
commits of history):

```
AUTH_PASSWORD_HASH=<salt-hex>:<derived-key-hex>
AUTH_SESSION_SECRET=<32 random bytes, hex>
```

Written by `npm run set-password` (`scripts/set-password.mjs`), which prompts for a password
with input hidden, derives the hash, generates the secret if absent, and rewrites `.env.local`
in place while preserving `OPENROUTER_API_KEY`. Both values are documented in
`.env.local.example` with placeholder text, never real values.

**Fail-closed rule:** if either variable is missing or malformed, the middleware denies every
request with a message pointing at `npm run set-password`. There is deliberately **no
`AUTH_ENABLED` flag** — an auth system with an off switch is the standard way auth ends up
off in production.

### Password hashing

`scrypt` from Node's built-in `node:crypto` (N=16384, r=8, p=1, 32-byte key, 16-byte random
salt). Verification uses `timingSafeEqual`, never `===`, so response time does not leak how
much of the hash matched.

Password verification happens **only** in the login route handler, which runs on the Node
runtime where `node:crypto` is available.

### Session token — and the runtime constraint that shapes it

Next.js middleware runs on the **Edge runtime, which does not provide `node:crypto`**. Any
signing primitive the middleware touches must therefore come from **Web Crypto**
(`crypto.subtle`), which is available in both Edge middleware and Node route handlers. This is
the single most important implementation constraint in this spec; using `crypto.createHmac` in
the middleware will fail at runtime, not at build time.

Token format, stateless — no session table:

```
<expiresAtMs>.<base64url(HMAC-SHA256(expiresAtMs, AUTH_SESSION_SECRET))>
```

`lib/auth.ts` exposes `signSession(expiresAt)` and `verifySession(token)`, both async, both
built on `crypto.subtle.importKey` + `sign`. Verification checks, in order: format parses,
signature matches (constant-time comparison), and `expiresAt > Date.now()`. Any failure is a
plain rejection — no partial trust.

Stateless is chosen over a sessions table because there is one user: server-side revocation
buys nothing that rotating `AUTH_SESSION_SECRET` does not, and rotation invalidates all
sessions instantly.

### Cookie

Name `jt_session`. Flags: `httpOnly` (scripts cannot read it), `sameSite: 'lax'` (blocks
cross-site POST, which is sufficient CSRF defence for a same-origin form), `path: '/'`,
`maxAge` 30 days, and `secure: process.env.NODE_ENV === 'production'`.

`secure` is conditional rather than always-on because Safari refuses `Secure` cookies over
`http://localhost`, which would break local development. **Consequence, and it must be in the
README: when exposing the app through the tunnel, run `npm run build && npm start`, not
`npm run dev`.** Production mode is what turns the `Secure` flag on; it also avoids serving
source maps and verbose stack traces to the public internet.

### The gate — `middleware.ts`

A single root `middleware.ts` matching all routes except `/login`, `/api/auth/login`,
`/_next/*`, and `/favicon.ico`.

Behaviour on a missing or invalid session depends on the caller:

- **API routes** (`/api/*`) → `401` with a JSON body.
- **Pages** → `302` to `/login?next=<original-path>`.

**The `next` parameter must be validated before it is used as a redirect target.** Accept it
only if it starts with a single `/` and not `//` (protocol-relative), and reject anything
containing a scheme or a backslash; otherwise fall back to `/`. Without this, an attacker can
send `?next=https://evil.com`, and a user who logs in successfully is bounced straight to a
phishing page carrying the app's own domain in the referrer — a classic open redirect. This
also means `/api/auth/logout` is exempt from the gate alongside `/login` and
`/api/auth/login`, so an expired session clicking Logout gets a clean redirect rather than a
raw `401` payload.

The split matters. Every fetch in this app already distinguishes a failed response from an
empty one — a regression where `Board` rendered five empty columns for a dead server, rather
than an error, was one of the bugs found in the final Phase 1 review. Redirecting an API call
to an HTML login page would reintroduce exactly that failure shape.

### Rate limiting

Module-level `Map` in `lib/auth.ts`. Precisely: attempts 1–5 with a wrong password each return
`401`; once the counter reaches 5, every further attempt returns `429` until 15 minutes have
elapsed since the fifth failure, **including an attempt with the correct password** — the
lockout is checked before the password is. The counter clears on any successful login.

In-memory is adequate and intentional: single process, single user, and a
restart-clears-the-lockout weakness is not meaningfully exploitable by someone who cannot
restart the server. Applies to the login route only.

### Routes and components

| Path | Type | Purpose |
|---|---|---|
| `/login` | page | Password field, error text, submits to the login route |
| `/api/auth/login` | route | Verify password, set cookie, or `401` / `429` |
| `/api/auth/logout` | route | Clear cookie, redirect to `/login` |

`app/layout.tsx` currently renders the nav unconditionally. The nav is extracted into
`components/SiteHeader.tsx`, a client component that renders `null` on `/login` and otherwise
renders the existing Board/Profile links plus a Logout button. Existing link styling and the
`h-14 border-b border-hairline` header shell are preserved verbatim.

Login page styling follows the existing dark token system — `bg-canvas`, `text-ink`,
`border-hairline`, and the existing `Button` component. Per the design system, accent lavender
is used for the submit button only, never as a background fill elsewhere. Error text uses
`text-red-400`, consistent with the twelve existing usages, rather than introducing a token
this change does not otherwise need.

## Verification

Automated (Vitest, matching existing conventions):

1. `signSession` → `verifySession` round-trips.
2. A token with a tampered payload is rejected.
3. A token with a tampered signature is rejected.
4. An expired token is rejected.
5. A malformed token (no dot, empty, garbage) is rejected rather than throwing.
6. Correct password verifies; wrong password does not.
7. Login returns `401` on a wrong password and sets no cookie.
8. The fifth wrong password returns `401`; the sixth attempt returns `429`.
9. While locked out, even the **correct** password returns `429`.
10. A successful login clears the failure counter.
11. Middleware denies every request when `AUTH_PASSWORD_HASH` is unset (fail-closed).
12. Each protected API route returns `401` without a cookie and passes through with one.
13. An unauthenticated page request redirects to `/login` preserving `next`.
14. A hostile `next` (`https://evil.com`, `//evil.com`, `/\evil.com`) falls back to `/`.

Manual, after implementation:

1. `npm run set-password`, restart, confirm `/` redirects to `/login`.
2. Wrong password shows an error; six attempts show the lockout message.
3. Correct password lands on the board with data intact.
4. Reload — still logged in.
5. Logout returns to `/login`, and the back button does not restore the board.
6. `npm run build && npm start`, tunnel it, confirm login works over HTTPS from a phone.

## Out of scope

Multi-user accounts, password reset (re-run the setup script), "remember me" as a separate
toggle, 2FA, and any server-side session revocation list. Each was considered and declined as
disproportionate for a single-user personal tool.
