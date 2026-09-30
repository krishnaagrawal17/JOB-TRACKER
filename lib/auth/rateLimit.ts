/**
 * In-memory brute-force protection for the login route, keyed per email.
 *
 * Deliberately process-local: this app is multi-user but single-process. A
 * restart clears every lockout, which is not meaningfully exploitable by
 * someone who cannot restart the server. Keying by email (rather than a
 * single global counter) is load-bearing now that there's more than one
 * account: a global counter would let one user's failed attempts lock every
 * other user out of the app.
 */
export const MAX_ATTEMPTS = 5;
export const LOCKOUT_MS = 15 * 60 * 1000;

interface Entry {
  failures: number;
  lockedUntil: number;
}

const attempts = new Map<string, Entry>();

function normalize(email: string): string {
  return email.trim().toLowerCase();
}

export function isLockedOut(email: string, now: number = Date.now()): boolean {
  const key = normalize(email);
  const entry = attempts.get(key);
  if (!entry || entry.lockedUntil === 0) return false;
  if (now >= entry.lockedUntil) {
    attempts.delete(key);
    return false;
  }
  return true;
}

export function recordFailure(email: string, now: number = Date.now()): void {
  const key = normalize(email);
  const entry = attempts.get(key) ?? { failures: 0, lockedUntil: 0 };
  entry.failures += 1;
  if (entry.failures >= MAX_ATTEMPTS) entry.lockedUntil = now + LOCKOUT_MS;
  attempts.set(key, entry);
}

export function clearFailures(email: string): void {
  attempts.delete(normalize(email));
}

export function resetRateLimitForTests(): void {
  attempts.clear();
}
