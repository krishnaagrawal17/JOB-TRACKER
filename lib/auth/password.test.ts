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
