# Single-User Authentication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gate every page and API route of the Job Tracker behind a single-user password login, so the app can be exposed through a tunnel without strangers reaching the owner's data or OpenRouter credit.

**Architecture:** A stateless signed session cookie. `npm run set-password` writes a scrypt hash and a random HMAC secret into `.env.local`. The login route verifies the password and issues a cookie containing an expiry timestamp plus an HMAC signature. A root `middleware.ts` verifies that signature on every request, redirecting pages to `/login` and returning `401` to API routes.

**Tech Stack:** Next.js 15 App Router, TypeScript strict, Vitest + Testing Library, `node:crypto` (scrypt) and Web Crypto (`crypto.subtle` HMAC). **No new dependencies.**

**Spec:** `docs/superpowers/specs/2026-08-16-job-tracker-auth-design.md`

## Global Constraints

- **Zero new runtime dependencies.** Verified available on Node 22: `node:crypto` `scrypt`/`timingSafeEqual`, and `globalThis.crypto.subtle.sign`.
- **The Edge/Node split is mandatory, not stylistic.** Next.js middleware runs on the Edge runtime, which has no `node:crypto`. `lib/auth/session.ts` must use **only** Web Crypto and must never import `node:crypto`, `Buffer`, or `lib/auth/password.ts`. Middleware imports `session.ts` only. Violating this fails at runtime, not at build time.
- **Fail closed.** Missing or malformed `AUTH_PASSWORD_HASH` / `AUTH_SESSION_SECRET` denies every request. There is no `AUTH_ENABLED` flag.
- Cookie name `jt_session`; flags `httpOnly`, `sameSite: 'lax'`, `path: '/'`, `maxAge` 30 days, `secure: process.env.NODE_ENV === 'production'`.
- Rate limit: attempts 1–5 return `401`; from the 5th failure, 15 minutes of `429` — **including for a correct password**.
- Route handlers that use `node:crypto` must declare `export const runtime = 'nodejs';`, matching every existing route in `app/api/`.
- Tests use Vitest globals (`describe`/`it`/`expect` — `globals: true`, no imports needed), `@` path alias, and live beside their subject as `*.test.ts`.
- Error text uses `text-red-400`, consistent with the twelve existing usages. Accent lavender is used for the submit button only, never as a background fill.

**Task order is deliberate: the gate lands LAST.** Every earlier task leaves the app fully working, so the owner can keep using it while this is built. Task 7 is the moment the app locks and requires a password.

---

### Task 1: Session token signing and verification (Edge-safe)

**Files:**
- Create: `lib/auth/session.ts`
- Test: `lib/auth/session.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `signSession(expiresAt: number, secret: string): Promise<string>` and `verifySession(token: string, secret: string, now?: number): Promise<boolean>`. Task 5 uses `signSession`; Task 7 uses `verifySession`. `SESSION_COOKIE_NAME = 'jt_session'` and `SESSION_MAX_AGE_SECONDS = 2592000` are exported here and used by Tasks 5, 6 and 7.

- [ ] **Step 1: Write the failing test**

```ts
import { signSession, verifySession, SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS } from './session';

const SECRET = 'test-secret-do-not-use-in-production';

describe('session tokens', () => {
  it('round-trips a token it just signed', async () => {
    const expiresAt = Date.now() + 60_000;
    const token = await signSession(expiresAt, SECRET);
    expect(await verifySession(token, SECRET)).toBe(true);
  });

  it('rejects a tampered payload', async () => {
    const token = await signSession(Date.now() + 60_000, SECRET);
    const sig = token.slice(token.lastIndexOf('.') + 1);
    const forged = `${Date.now() + 999_000_000}.${sig}`;
    expect(await verifySession(forged, SECRET)).toBe(false);
  });

  it('rejects a tampered signature', async () => {
    const token = await signSession(Date.now() + 60_000, SECRET);
    const [payload] = token.split('.');
    expect(await verifySession(`${payload}.AAAAAAAAAAAAAAAAAAAAAAAAAAAA`, SECRET)).toBe(false);
  });

  it('rejects a token signed with a different secret', async () => {
    const token = await signSession(Date.now() + 60_000, SECRET);
    expect(await verifySession(token, 'some-other-secret')).toBe(false);
  });

  it('rejects an expired token', async () => {
    const token = await signSession(Date.now() - 1, SECRET);
    expect(await verifySession(token, SECRET)).toBe(false);
  });

  it.each(['', 'no-dot', '.', 'abc.def', '12345', 'NaN.AAAA'])(
    'rejects malformed token %j without throwing',
    async (bad) => {
      expect(await verifySession(bad, SECRET)).toBe(false);
    },
  );

  it('exports the cookie name and a 30 day max age', () => {
    expect(SESSION_COOKIE_NAME).toBe('jt_session');
    expect(SESSION_MAX_AGE_SECONDS).toBe(60 * 60 * 24 * 30);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/auth/session.test.ts`
Expected: FAIL — cannot resolve `./session`.

- [ ] **Step 3: Write minimal implementation**

```ts
/**
 * Session tokens. EDGE-SAFE BY CONTRACT: this module runs inside Next.js
 * middleware, which uses the Edge runtime and has no `node:crypto`. Use only
 * Web Crypto here. Never import `node:crypto`, `Buffer`, or `./password`.
 */
export const SESSION_COOKIE_NAME = 'jt_session';
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

const encoder = new TextEncoder();

async function importKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToBytes(value: string): Uint8Array | null {
  try {
    const padded = value.replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

export async function signSession(expiresAt: number, secret: string): Promise<string> {
  const payload = String(expiresAt);
  const key = await importKey(secret);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  return `${payload}.${bytesToBase64Url(new Uint8Array(signature))}`;
}

export async function verifySession(
  token: string,
  secret: string,
  now: number = Date.now(),
): Promise<boolean> {
  if (!token || !secret) return false;

  const separator = token.lastIndexOf('.');
  if (separator <= 0 || separator === token.length - 1) return false;

  const payload = token.slice(0, separator);
  if (!/^\d+$/.test(payload)) return false;

  const expiresAt = Number(payload);
  if (!Number.isSafeInteger(expiresAt)) return false;

  const signature = base64UrlToBytes(token.slice(separator + 1));
  if (!signature) return false;

  const key = await importKey(secret);
  // crypto.subtle.verify compares in constant time.
  const valid = await crypto.subtle.verify('HMAC', key, signature, encoder.encode(payload));
  if (!valid) return false;

  return expiresAt > now;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/auth/session.test.ts`
Expected: PASS (11 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/auth/session.ts lib/auth/session.test.ts
git commit -m "feat(auth): edge-safe signed session tokens"
```

---

### Task 2: Password hashing and verification (Node-only)

**Files:**
- Create: `lib/auth/password.ts`
- Test: `lib/auth/password.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `hashPassword(password: string): Promise<string>` returning `"<saltHex>:<keyHex>"`, and `verifyPassword(password: string, stored: string): Promise<boolean>`. Task 3's script uses `hashPassword`; Task 5's login route uses `verifyPassword`.

- [ ] **Step 1: Write the failing test**

```ts
import { hashPassword, verifyPassword } from './password';

describe('password hashing', () => {
  it('verifies the correct password', async () => {
    const stored = await hashPassword('correct horse battery staple');
    expect(await verifyPassword('correct horse battery staple', stored)).toBe(true);
  });

  it('rejects the wrong password', async () => {
    const stored = await hashPassword('correct horse battery staple');
    expect(await verifyPassword('wrong password', stored)).toBe(false);
  });

  it('never stores the plaintext password', async () => {
    const stored = await hashPassword('hunter2');
    expect(stored).not.toContain('hunter2');
  });

  it('produces a different hash each time for the same password', async () => {
    const a = await hashPassword('same');
    const b = await hashPassword('same');
    expect(a).not.toBe(b);
    expect(await verifyPassword('same', a)).toBe(true);
    expect(await verifyPassword('same', b)).toBe(true);
  });

  it.each(['', 'nocolon', ':', 'zz:zz', 'abc:', ':abc', 'aa:bb'])(
    'rejects malformed stored hash %j without throwing',
    async (bad) => {
      expect(await verifyPassword('anything', bad)).toBe(false);
    },
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/auth/password.test.ts`
Expected: FAIL — cannot resolve `./password`.

- [ ] **Step 3: Write minimal implementation**

```ts
/**
 * Password hashing. NODE-ONLY: uses `node:crypto` and must never be imported
 * by `middleware.ts` or by `./session.ts`, which run on the Edge runtime.
 */
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number },
) => Promise<Buffer>;

const KEY_LENGTH = 32;
const SALT_LENGTH = 16;
const PARAMS = { N: 16384, r: 8, p: 1 };

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const key = await scryptAsync(password, salt, KEY_LENGTH, PARAMS);
  return `${salt.toString('hex')}:${key.toString('hex')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [saltHex, keyHex] = stored.split(':');
  if (!saltHex || !keyHex) return false;
  if (!/^[0-9a-f]+$/i.test(saltHex) || !/^[0-9a-f]+$/i.test(keyHex)) return false;

  const salt = Buffer.from(saltHex, 'hex');
  const expected = Buffer.from(keyHex, 'hex');
  if (salt.length !== SALT_LENGTH || expected.length !== KEY_LENGTH) return false;

  const actual = await scryptAsync(password, salt, KEY_LENGTH, PARAMS);
  // Constant-time: never `===`, which would leak how much of the hash matched.
  return timingSafeEqual(actual, expected);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/auth/password.test.ts`
Expected: PASS (11 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/auth/password.ts lib/auth/password.test.ts
git commit -m "feat(auth): scrypt password hashing with constant-time verify"
```

---

### Task 3: `npm run set-password` setup script

**Files:**
- Create: `scripts/set-password.mjs`
- Modify: `package.json` (add the `set-password` script)
- Modify: `.env.local.example`

**Interfaces:**
- Consumes: `hashPassword` from Task 2.
- Produces: an `.env.local` containing `AUTH_PASSWORD_HASH` and `AUTH_SESSION_SECRET`, read by Tasks 5 and 7.

This task has no unit test — it is an interactive terminal script whose entire behaviour is prompting and file I/O. It is verified manually in Step 4.

- [ ] **Step 1: Write the script**

```js
#!/usr/bin/env node
/**
 * Interactive one-time setup: writes AUTH_PASSWORD_HASH and AUTH_SESSION_SECRET
 * into .env.local, preserving any values already there (notably OPENROUTER_API_KEY).
 * Run with: npm run set-password
 */
import { randomBytes, scrypt } from 'node:crypto';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';

const scryptAsync = promisify(scrypt);
const ENV_PATH = path.join(process.cwd(), '.env.local');

function promptHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const onData = (char) => {
      if (['\n', '\r', ''].includes(char.toString())) {
        process.stdin.removeListener('data', onData);
      } else {
        process.stdout.write('\x1b[2K\x1b[200D' + question + '*'.repeat(rl.line.length));
      }
    };
    process.stdin.on('data', onData);
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
  });
}

function upsertEnv(contents, key, value) {
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, 'm');
  if (pattern.test(contents)) return contents.replace(pattern, line);
  return contents.length && !contents.endsWith('\n') ? `${contents}\n${line}\n` : `${contents}${line}\n`;
}

const password = await promptHidden('Choose a password: ');
if (password.length < 8) {
  console.error('\nPassword must be at least 8 characters.');
  process.exit(1);
}
const confirm = await promptHidden('Confirm password: ');
if (password !== confirm) {
  console.error('\nPasswords did not match.');
  process.exit(1);
}

const salt = randomBytes(16);
const key = await scryptAsync(password, salt, 32, { N: 16384, r: 8, p: 1 });
const hash = `${salt.toString('hex')}:${key.toString('hex')}`;

let contents = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, 'utf8') : '';
contents = upsertEnv(contents, 'AUTH_PASSWORD_HASH', hash);
if (!/^AUTH_SESSION_SECRET=.+$/m.test(contents)) {
  contents = upsertEnv(contents, 'AUTH_SESSION_SECRET', randomBytes(32).toString('hex'));
  console.log('Generated a new session secret.');
} else {
  console.log('Kept the existing session secret, so you stay logged in elsewhere.');
}

fs.writeFileSync(ENV_PATH, contents, { mode: 0o600 });
console.log(`Password saved to ${ENV_PATH}. Restart the app for it to take effect.`);
```

- [ ] **Step 2: Register the script and document the variables**

In `package.json`, add to `"scripts"`:

```json
"set-password": "node scripts/set-password.mjs"
```

Replace `.env.local.example` with:

```
OPENROUTER_API_KEY=your-openrouter-key-here

# Both of the following are written by `npm run set-password`.
# Never commit real values — .env.local is gitignored.
AUTH_PASSWORD_HASH=scrypt-salt-hex:scrypt-key-hex
AUTH_SESSION_SECRET=64-hex-characters-of-random
```

- [ ] **Step 3: Verify it does not clobber the API key**

```bash
cp .env.local /tmp/env-backup
npm run set-password        # choose any password twice
grep -c OPENROUTER_API_KEY .env.local     # expect 1
grep -c AUTH_PASSWORD_HASH .env.local     # expect 1
grep -c AUTH_SESSION_SECRET .env.local    # expect 1
```

Expected: all three print `1`, and the OpenRouter key value is unchanged.

- [ ] **Step 4: Verify re-running preserves the session secret**

```bash
grep AUTH_SESSION_SECRET .env.local > /tmp/secret-before
npm run set-password
grep AUTH_SESSION_SECRET .env.local > /tmp/secret-after
diff /tmp/secret-before /tmp/secret-after && echo "secret preserved"
```

Expected: prints `secret preserved`.

- [ ] **Step 5: Commit**

```bash
git add scripts/set-password.mjs package.json .env.local.example
git commit -m "feat(auth): add npm run set-password setup script"
```

---

### Task 4: Login rate limiter

**Files:**
- Create: `lib/auth/rateLimit.ts`
- Test: `lib/auth/rateLimit.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `isLockedOut(now?: number): boolean`, `recordFailure(now?: number): void`, `clearFailures(): void`, `resetRateLimitForTests(): void`. Task 5's login route uses the first three.

- [ ] **Step 1: Write the failing test**

```ts
import {
  isLockedOut,
  recordFailure,
  clearFailures,
  resetRateLimitForTests,
  MAX_ATTEMPTS,
  LOCKOUT_MS,
} from './rateLimit';

beforeEach(() => resetRateLimitForTests());

describe('login rate limiting', () => {
  it('is not locked out initially', () => {
    expect(isLockedOut()).toBe(false);
  });

  it('stays unlocked for the first four failures', () => {
    for (let i = 0; i < MAX_ATTEMPTS - 1; i += 1) recordFailure();
    expect(isLockedOut()).toBe(false);
  });

  it('locks out on the fifth failure', () => {
    for (let i = 0; i < MAX_ATTEMPTS; i += 1) recordFailure();
    expect(isLockedOut()).toBe(true);
  });

  it('unlocks after the lockout window elapses', () => {
    const start = 1_000_000;
    for (let i = 0; i < MAX_ATTEMPTS; i += 1) recordFailure(start);
    expect(isLockedOut(start + LOCKOUT_MS - 1)).toBe(true);
    expect(isLockedOut(start + LOCKOUT_MS + 1)).toBe(false);
  });

  it('clears the counter on success', () => {
    for (let i = 0; i < MAX_ATTEMPTS; i += 1) recordFailure();
    clearFailures();
    expect(isLockedOut()).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/auth/rateLimit.test.ts`
Expected: FAIL — cannot resolve `./rateLimit`.

- [ ] **Step 3: Write minimal implementation**

```ts
/**
 * In-memory brute-force protection for the login route.
 *
 * Deliberately process-local: this app is single-user and single-process. A
 * restart clears the lockout, which is not meaningfully exploitable by someone
 * who cannot restart the server.
 */
export const MAX_ATTEMPTS = 5;
export const LOCKOUT_MS = 15 * 60 * 1000;

let failures = 0;
let lockedUntil = 0;

export function isLockedOut(now: number = Date.now()): boolean {
  if (lockedUntil === 0) return false;
  if (now >= lockedUntil) {
    failures = 0;
    lockedUntil = 0;
    return false;
  }
  return true;
}

export function recordFailure(now: number = Date.now()): void {
  failures += 1;
  if (failures >= MAX_ATTEMPTS) lockedUntil = now + LOCKOUT_MS;
}

export function clearFailures(): void {
  failures = 0;
  lockedUntil = 0;
}

export function resetRateLimitForTests(): void {
  clearFailures();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/auth/rateLimit.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/auth/rateLimit.ts lib/auth/rateLimit.test.ts
git commit -m "feat(auth): in-memory login rate limiting"
```

---

### Task 5: Login and logout API routes

**Files:**
- Create: `app/api/auth/login/route.ts`
- Create: `app/api/auth/logout/route.ts`
- Test: `app/api/auth/login/route.test.ts`

**Interfaces:**
- Consumes: `verifyPassword` (Task 2); `signSession`, `SESSION_COOKIE_NAME`, `SESSION_MAX_AGE_SECONDS` (Task 1); `isLockedOut`, `recordFailure`, `clearFailures` (Task 4).
- Produces: `POST /api/auth/login` accepting `{ "password": string }`, and `POST /api/auth/logout`. Task 6's pages call both.

- [ ] **Step 1: Write the failing test**

```ts
import { NextRequest } from 'next/server';
import { hashPassword } from '@/lib/auth/password';
import { resetRateLimitForTests, MAX_ATTEMPTS } from '@/lib/auth/rateLimit';
import { SESSION_COOKIE_NAME } from '@/lib/auth/session';

const PASSWORD = 'a-good-test-password';

function post(password: unknown): NextRequest {
  return new NextRequest('http://localhost:3000/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ password }),
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(async () => {
  resetRateLimitForTests();
  process.env.AUTH_PASSWORD_HASH = await hashPassword(PASSWORD);
  process.env.AUTH_SESSION_SECRET = 'test-session-secret';
});

describe('POST /api/auth/login', () => {
  it('sets a session cookie for the correct password', async () => {
    const { POST } = await import('./route');
    const response = await POST(post(PASSWORD));
    expect(response.status).toBe(200);
    expect(response.cookies.get(SESSION_COOKIE_NAME)?.value).toBeTruthy();
  });

  it('rejects the wrong password with 401 and no cookie', async () => {
    const { POST } = await import('./route');
    const response = await POST(post('nope'));
    expect(response.status).toBe(401);
    expect(response.cookies.get(SESSION_COOKIE_NAME)).toBeUndefined();
  });

  it('rejects a non-string password with 400', async () => {
    const { POST } = await import('./route');
    expect((await POST(post(12345))).status).toBe(400);
  });

  it('returns 429 on the attempt after the limit is reached', async () => {
    const { POST } = await import('./route');
    for (let i = 0; i < MAX_ATTEMPTS; i += 1) {
      expect((await POST(post('wrong'))).status).toBe(401);
    }
    expect((await POST(post('wrong'))).status).toBe(429);
  });

  it('returns 429 for the CORRECT password while locked out', async () => {
    const { POST } = await import('./route');
    for (let i = 0; i < MAX_ATTEMPTS; i += 1) await POST(post('wrong'));
    expect((await POST(post(PASSWORD))).status).toBe(429);
  });

  it('clears the failure counter after a success', async () => {
    const { POST } = await import('./route');
    await POST(post('wrong'));
    await POST(post('wrong'));
    expect((await POST(post(PASSWORD))).status).toBe(200);
    for (let i = 0; i < MAX_ATTEMPTS; i += 1) {
      expect((await POST(post('wrong'))).status).toBe(401);
    }
  });

  it('fails closed with 500 when the password hash is not configured', async () => {
    delete process.env.AUTH_PASSWORD_HASH;
    const { POST } = await import('./route');
    expect((await POST(post(PASSWORD))).status).toBe(500);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/api/auth/login/route.test.ts`
Expected: FAIL — cannot resolve `./route`.

- [ ] **Step 3: Write the login route**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { verifyPassword } from '@/lib/auth/password';
import { clearFailures, isLockedOut, recordFailure } from '@/lib/auth/rateLimit';
import { SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS, signSession } from '@/lib/auth/session';

export const runtime = 'nodejs';

interface LoginRequestBody {
  password?: unknown;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Checked before the password, so a lockout cannot be probed with a correct guess.
  if (isLockedOut()) {
    return NextResponse.json(
      { error: 'Too many failed attempts. Try again in 15 minutes.' },
      { status: 429 },
    );
  }

  const hash = process.env.AUTH_PASSWORD_HASH;
  const secret = process.env.AUTH_SESSION_SECRET;
  if (!hash || !secret) {
    return NextResponse.json(
      { error: 'Authentication is not configured. Run `npm run set-password`.' },
      { status: 500 },
    );
  }

  let body: LoginRequestBody;
  try {
    body = (await request.json()) as LoginRequestBody;
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  if (typeof body.password !== 'string') {
    return NextResponse.json({ error: 'password must be a string.' }, { status: 400 });
  }

  if (!(await verifyPassword(body.password, hash))) {
    recordFailure();
    return NextResponse.json({ error: 'Incorrect password.' }, { status: 401 });
  }

  clearFailures();

  const expiresAt = Date.now() + SESSION_MAX_AGE_SECONDS * 1000;
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE_NAME, await signSession(expiresAt, secret), {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
    secure: process.env.NODE_ENV === 'production',
  });
  return response;
}
```

- [ ] **Step 4: Write the logout route**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE_NAME } from '@/lib/auth/session';

export const runtime = 'nodejs';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const response = NextResponse.redirect(new URL('/login', request.url), { status: 303 });
  response.cookies.set(SESSION_COOKIE_NAME, '', {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
    secure: process.env.NODE_ENV === 'production',
  });
  return response;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run app/api/auth/login/route.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 6: Commit**

```bash
git add app/api/auth
git commit -m "feat(auth): login and logout routes with lockout"
```

---

### Task 6: Login page and header with logout

**Files:**
- Create: `components/LoginForm.tsx` (client component — the actual form)
- Create: `app/login/page.tsx` (server component — Suspense wrapper only)
- Create: `components/SiteHeader.tsx`
- Modify: `app/layout.tsx:20-29` (replace the inline `<header>` with `<SiteHeader />`)
- Test: `components/LoginForm.test.tsx`, `components/SiteHeader.test.tsx`

**Interfaces:**
- Consumes: `POST /api/auth/login` and `POST /api/auth/logout` (Task 5).
- Produces: the `/login` route that Task 7's middleware redirects to.

**Why the form is split out of the page:** `useSearchParams()` forces a component into
client-side rendering, and Next.js 15 **fails the production build** with "useSearchParams()
should be wrapped in a suspense boundary" if such a component is prerendered without one. This
is the first use of `useSearchParams` in the codebase, so nothing here handles it yet. The page
stays a server component whose only job is the `<Suspense>` boundary; the form is a separate
client component, which is also what makes it directly testable.

- [ ] **Step 1: Write the failing tests**

```tsx
// components/LoginForm.test.tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LoginForm from './LoginForm';

const replace = vi.fn();
let search = 'next=/profile';
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => new URLSearchParams(search),
}));

beforeEach(() => {
  replace.mockClear();
  search = 'next=/profile';
  global.fetch = vi.fn();
});

async function submit(password: string) {
  await userEvent.type(screen.getByLabelText(/password/i), password);
  await userEvent.click(screen.getByRole('button', { name: /log in/i }));
}

describe('LoginForm', () => {
  it('renders a password field and submit button', () => {
    render(<LoginForm />);
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /log in/i })).toBeInTheDocument();
  });

  it('redirects to the requested path on success', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, status: 200 });
    render(<LoginForm />);
    await submit('secret');
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/profile'));
  });

  // Spec verification item 14: open-redirect defence.
  it.each([
    'next=https://evil.com',
    'next=//evil.com',
    'next=/\\evil.com',
    'next=http://evil.com/path',
    '',
  ])('falls back to / for hostile or missing next (%j)', async (query) => {
    search = query;
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, status: 200 });
    render(<LoginForm />);
    await submit('secret');
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/'));
  });

  it('shows the server error message on failure', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: 'Incorrect password.' }),
    });
    render(<LoginForm />);
    await submit('bad');
    expect(await screen.findByText('Incorrect password.')).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it('does not submit twice while a request is in flight', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(
      () => new Promise(() => {}),
    );
    render(<LoginForm />);
    await submit('secret');
    await userEvent.click(screen.getByRole('button', { name: /log in/i }));
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
```

```tsx
// components/SiteHeader.test.tsx
import { render, screen } from '@testing-library/react';
import SiteHeader from './SiteHeader';

const pathname = vi.fn();
vi.mock('next/navigation', () => ({ usePathname: () => pathname() }));

describe('SiteHeader', () => {
  it('renders nothing on the login page', () => {
    pathname.mockReturnValue('/login');
    const { container } = render(<SiteHeader />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders navigation and a logout control elsewhere', () => {
    pathname.mockReturnValue('/');
    render(<SiteHeader />);
    expect(screen.getByRole('link', { name: 'Board' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Profile' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /log out/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run components/LoginForm.test.tsx components/SiteHeader.test.tsx`
Expected: FAIL — cannot resolve `./LoginForm` and `./SiteHeader`.

- [ ] **Step 3: Write the login form (client component)**

```tsx
'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';

/**
 * Only same-origin absolute paths are accepted. Without this, `?next=https://evil.com`
 * would bounce a freshly authenticated user to an attacker's page — an open redirect.
 */
function safeNextPath(value: string | null): string {
  if (!value) return '/';
  if (!value.startsWith('/')) return '/';
  if (value.startsWith('//')) return '/';
  if (value.includes('\\')) return '/';
  return value;
}

export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (response.ok) {
        router.replace(safeNextPath(searchParams.get('next')));
        return;
      }
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error ?? 'Could not log in.');
    } catch {
      setError('Could not reach the server.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center px-lg">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-lg border border-hairline bg-surface-1 p-lg"
      >
        <h1 className="text-h2 text-ink">Job Tracker</h1>
        <p className="mt-xs text-body-sm text-ink-muted">Enter your password to continue.</p>

        <label htmlFor="password" className="mt-lg block text-body-sm text-ink-muted">
          Password
        </label>
        <input
          id="password"
          type="password"
          autoFocus
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="mt-xs w-full rounded-md border border-hairline bg-canvas px-sm py-xs text-body text-ink outline-none focus:border-accent"
        />

        {error && (
          <p role="status" aria-live="polite" className="mt-sm text-body-sm text-red-400">
            {error}
          </p>
        )}

        <Button type="submit" disabled={submitting} className="mt-lg w-full">
          {submitting ? 'Logging in…' : 'Log in'}
        </Button>
      </form>
    </main>
  );
}
```

- [ ] **Step 4: Write the page as a Suspense wrapper (server component — no `'use client'`)**

```tsx
import { Suspense } from 'react';
import LoginForm from '@/components/LoginForm';

// LoginForm calls useSearchParams(), which Next.js 15 requires to sit inside a
// Suspense boundary. Without this, `npm run build` fails during prerendering.
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
```

- [ ] **Step 5: Write the header component**

```tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function SiteHeader() {
  const pathname = usePathname();
  if (pathname === '/login') return null;

  return (
    <header className="flex h-14 items-center gap-lg border-b border-hairline bg-canvas px-lg">
      <nav className="flex gap-md text-body-sm">
        <Link href="/" className="text-ink hover:text-accent-hover">
          Board
        </Link>
        <Link href="/profile" className="text-ink-muted hover:text-accent-hover">
          Profile
        </Link>
      </nav>
      <form action="/api/auth/logout" method="post" className="ml-auto">
        <button type="submit" className="text-body-sm text-ink-muted hover:text-accent-hover">
          Log out
        </button>
      </form>
    </header>
  );
}
```

- [ ] **Step 6: Wire it into the layout**

In `app/layout.tsx`, add `import SiteHeader from '@/components/SiteHeader';`, delete the `import Link from 'next/link';` line (now unused), and replace the entire `<header>…</header>` block with `<SiteHeader />`.

- [ ] **Step 7: Run the full suite and confirm the build survives Suspense**

```bash
npm test
npm run build
```

Expected: all tests pass (10 new ones across the two files), and the build succeeds. If the
build reports "useSearchParams() should be wrapped in a suspense boundary", Step 4's wrapper is
missing or `'use client'` was left at the top of `app/login/page.tsx`.

- [ ] **Step 8: Commit**

```bash
git add app/login components/LoginForm.tsx components/LoginForm.test.tsx \
        components/SiteHeader.tsx components/SiteHeader.test.tsx app/layout.tsx
git commit -m "feat(auth): login form, page and header logout control"
```

---

### Task 7: The middleware gate

**Files:**
- Create: `middleware.ts`
- Test: `middleware.test.ts`

**Interfaces:**
- Consumes: `verifySession`, `SESSION_COOKIE_NAME`, `signSession` (Task 1).
- Produces: nothing further — this is the final task.

**This is the task that locks the app.** After it lands, `npm run set-password` must have been run or every request is denied. That is the intended fail-closed behaviour.

- [ ] **Step 1: Write the failing test**

```ts
import { NextRequest } from 'next/server';
import { signSession, SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS } from '@/lib/auth/session';
import { middleware } from './middleware';

const SECRET = 'middleware-test-secret';

function request(pathname: string, cookie?: string): NextRequest {
  const req = new NextRequest(`http://localhost:3000${pathname}`);
  if (cookie) req.cookies.set(SESSION_COOKIE_NAME, cookie);
  return req;
}

async function validCookie(): Promise<string> {
  return signSession(Date.now() + SESSION_MAX_AGE_SECONDS * 1000, SECRET);
}

beforeEach(() => {
  process.env.AUTH_SESSION_SECRET = SECRET;
  process.env.AUTH_PASSWORD_HASH = 'aa:bb';
});

describe('middleware gate', () => {
  it.each(['/login', '/api/auth/login', '/api/auth/logout'])(
    'lets %s through without a session',
    async (path) => {
      expect((await middleware(request(path))).status).toBe(200);
    },
  );

  it('redirects an unauthenticated page request to /login with next', async () => {
    const response = await middleware(request('/profile'));
    expect(response.status).toBe(307);
    const location = new URL(response.headers.get('location') as string);
    expect(location.pathname).toBe('/login');
    expect(location.searchParams.get('next')).toBe('/profile');
  });

  it('returns 401 JSON for an unauthenticated API request', async () => {
    const response = await middleware(request('/api/jobs'));
    expect(response.status).toBe(401);
    expect(response.headers.get('content-type')).toContain('application/json');
  });

  it('allows a page request carrying a valid session', async () => {
    expect((await middleware(request('/profile', await validCookie()))).status).toBe(200);
  });

  it('allows an API request carrying a valid session', async () => {
    expect((await middleware(request('/api/jobs', await validCookie()))).status).toBe(200);
  });

  it('rejects a forged cookie', async () => {
    const forged = await signSession(Date.now() + 60_000, 'the-wrong-secret');
    expect((await middleware(request('/api/jobs', forged))).status).toBe(401);
  });

  it('rejects an expired cookie', async () => {
    const expired = await signSession(Date.now() - 1, SECRET);
    expect((await middleware(request('/api/jobs', expired))).status).toBe(401);
  });

  it('fails closed when auth is not configured', async () => {
    delete process.env.AUTH_PASSWORD_HASH;
    delete process.env.AUTH_SESSION_SECRET;
    expect((await middleware(request('/api/jobs', await validCookie()))).status).toBe(503);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run middleware.test.ts`
Expected: FAIL — cannot resolve `./middleware`.

- [ ] **Step 3: Write the middleware**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE_NAME, verifySession } from '@/lib/auth/session';

/**
 * EDGE RUNTIME. Only `lib/auth/session.ts` may be imported here — it is written
 * against Web Crypto. Importing `lib/auth/password.ts` would pull `node:crypto`
 * into the Edge bundle and fail at runtime.
 */
const PUBLIC_PATHS = new Set(['/login', '/api/auth/login', '/api/auth/logout']);

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;
  const isApi = pathname.startsWith('/api/');

  if (PUBLIC_PATHS.has(pathname)) return NextResponse.next();

  const secret = process.env.AUTH_SESSION_SECRET;
  const hash = process.env.AUTH_PASSWORD_HASH;
  if (!secret || !hash) {
    // Fail closed. Never fall through to NextResponse.next() here.
    return NextResponse.json(
      { error: 'Authentication is not configured. Run `npm run set-password`.' },
      { status: 503 },
    );
  }

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (token && (await verifySession(token, secret))) return NextResponse.next();

  if (isApi) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  }

  const loginUrl = new URL('/login', request.url);
  loginUrl.searchParams.set('next', pathname);
  return NextResponse.redirect(loginUrl);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run middleware.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 5: Verify the full suite and the production build**

```bash
npm test
npx tsc --noEmit
npm run build
```

Expected: all tests pass, no type errors, and the build succeeds. **The build is the real check that the Edge/Node split holds** — a `node:crypto` import reaching middleware surfaces here.

- [ ] **Step 6: Commit**

```bash
git add middleware.ts middleware.test.ts
git commit -m "feat(auth): gate every page and API route behind the session"
```

---

## Manual verification (after Task 7)

1. `npm run set-password`, then `npm run dev`.
2. Visit `http://localhost:3000/` → redirected to `/login?next=/`.
3. Wrong password → "Incorrect password." Six attempts → the lockout message.
4. Wait out the lockout or restart the server; correct password → the board, with the existing job still present.
5. Reload → still logged in. Click **Log out** → back to `/login`; pressing Back does not restore the board.
6. `curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/api/jobs` → `401`.
7. Visit `/login?next=https://example.com`, log in → lands on `/`, **not** example.com.
8. `npm run build && npm start`, expose via the tunnel, log in over HTTPS from a phone.

## Notes for the executor

- Run `npm run set-password` before Task 7's manual checks, or the app returns `503` everywhere by design.
- The dev server should be stopped during Task 7; hot-reloading a new `middleware.ts` into a running server produces confusing intermediate states.
- `lib/auth/session.ts` is imported by Edge middleware. If you add anything to it, it must remain free of `node:crypto` and `Buffer`.
