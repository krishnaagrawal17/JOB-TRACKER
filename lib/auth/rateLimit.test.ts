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

  it('resets the failure counter when lockout expires', () => {
    const start = 1_000_000;
    for (let i = 0; i < MAX_ATTEMPTS; i += 1) recordFailure(start);
    expect(isLockedOut(start + LOCKOUT_MS + 1)).toBe(false);
    recordFailure(start + LOCKOUT_MS + 1);
    expect(isLockedOut(start + LOCKOUT_MS + 1)).toBe(false);
  });
});
