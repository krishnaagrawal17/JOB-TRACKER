import { signSession, verifySession, SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS } from './session';

const SECRET = 'test-secret-do-not-use-in-production';
const USER_ID = 42;

describe('session tokens', () => {
  it('round-trips a token it just signed and returns the userId', async () => {
    const expiresAt = Date.now() + 60_000;
    const token = await signSession(USER_ID, expiresAt, SECRET);
    const result = await verifySession(token, SECRET);
    expect(result).not.toBeNull();
    expect(result?.userId).toBe(USER_ID);
  });

  it('rejects a tampered payload', async () => {
    const token = await signSession(USER_ID, Date.now() + 60_000, SECRET);
    const sig = token.slice(token.lastIndexOf('.') + 1);
    const forged = `99:${Date.now() + 999_000_000}.${sig}`;
    expect(await verifySession(forged, SECRET)).toBeNull();
  });

  it('rejects a tampered signature', async () => {
    const token = await signSession(USER_ID, Date.now() + 60_000, SECRET);
    const payload = token.slice(0, token.lastIndexOf('.'));
    expect(await verifySession(`${payload}.AAAAAAAAAAAAAAAAAAAAAAAAAAAA`, SECRET)).toBeNull();
  });

  it('rejects a token signed with a different secret', async () => {
    const token = await signSession(USER_ID, Date.now() + 60_000, SECRET);
    expect(await verifySession(token, 'some-other-secret')).toBeNull();
  });

  it('rejects an expired token', async () => {
    const token = await signSession(USER_ID, Date.now() - 1, SECRET);
    expect(await verifySession(token, SECRET)).toBeNull();
  });

  it.each(['', 'no-dot', '.', 'abc.def', '12345', 'NaN.AAAA', '0:1234.AAAA'])(
    'rejects malformed token %j without throwing',
    async (bad) => {
      expect(await verifySession(bad, SECRET)).toBeNull();
    },
  );

  it('exports the cookie name and a 30 day max age', () => {
    expect(SESSION_COOKIE_NAME).toBe('jt_session');
    expect(SESSION_MAX_AGE_SECONDS).toBe(60 * 60 * 24 * 30);
  });
});
