import {
  isLockedOut,
  recordFailure,
  clearFailures,
  resetRateLimitForTests,
  MAX_ATTEMPTS,
  LOCKOUT_MS,
} from './rateLimit';

const EMAIL = 'user@example.com';
const OTHER_EMAIL = 'other@example.com';

beforeEach(() => resetRateLimitForTests());

describe('login rate limiting', () => {
  it('is not locked out initially', () => {
    expect(isLockedOut(EMAIL)).toBe(false);
  });

  it('stays unlocked for the first four failures', () => {
    for (let i = 0; i < MAX_ATTEMPTS - 1; i += 1) recordFailure(EMAIL);
    expect(isLockedOut(EMAIL)).toBe(false);
  });

  it('locks out on the fifth failure', () => {
    for (let i = 0; i < MAX_ATTEMPTS; i += 1) recordFailure(EMAIL);
    expect(isLockedOut(EMAIL)).toBe(true);
  });

  it('unlocks after the lockout window elapses', () => {
    const start = 1_000_000;
    for (let i = 0; i < MAX_ATTEMPTS; i += 1) recordFailure(EMAIL, start);
    expect(isLockedOut(EMAIL, start + LOCKOUT_MS - 1)).toBe(true);
    expect(isLockedOut(EMAIL, start + LOCKOUT_MS + 1)).toBe(false);
  });

  it('clears the counter on success', () => {
    for (let i = 0; i < MAX_ATTEMPTS; i += 1) recordFailure(EMAIL);
    clearFailures(EMAIL);
    expect(isLockedOut(EMAIL)).toBe(false);
  });

  it('resets the failure counter when lockout expires', () => {
    const start = 1_000_000;
    for (let i = 0; i < MAX_ATTEMPTS; i += 1) recordFailure(EMAIL, start);
    expect(isLockedOut(EMAIL, start + LOCKOUT_MS + 1)).toBe(false);
    recordFailure(EMAIL, start + LOCKOUT_MS + 1);
    expect(isLockedOut(EMAIL, start + LOCKOUT_MS + 1)).toBe(false);
  });

  it('does not lock out a different email', () => {
    for (let i = 0; i < MAX_ATTEMPTS; i += 1) recordFailure(EMAIL);
    expect(isLockedOut(EMAIL)).toBe(true);
    expect(isLockedOut(OTHER_EMAIL)).toBe(false);
  });

  it('treats email case-insensitively, matching the DB column collation', () => {
    for (let i = 0; i < MAX_ATTEMPTS; i += 1) recordFailure(EMAIL);
    expect(isLockedOut(EMAIL.toUpperCase())).toBe(true);
  });
});
