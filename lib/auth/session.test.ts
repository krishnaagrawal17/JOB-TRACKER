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
