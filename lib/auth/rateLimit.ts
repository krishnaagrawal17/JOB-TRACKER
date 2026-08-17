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
