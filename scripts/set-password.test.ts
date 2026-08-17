// @vitest-environment node
import { verifyPassword } from '@/lib/auth/password';
import { hashPasswordForSetup, upsertEnv } from './set-password.mjs';

describe('hashPasswordForSetup', () => {
  it('produces a hash that lib/auth/password.ts can verify', async () => {
    const stored = await hashPasswordForSetup('correct horse battery staple');
    expect(await verifyPassword('correct horse battery staple', stored)).toBe(true);
  });

  it('rejects the wrong password against its own hash', async () => {
    const stored = await hashPasswordForSetup('correct horse battery staple');
    expect(await verifyPassword('wrong password', stored)).toBe(false);
  });
});

describe('upsertEnv', () => {
  it('leaves an existing unrelated key unchanged when upserting a different key', () => {
    const contents = 'OPENROUTER_API_KEY=abc123\n';
    const result = upsertEnv(contents, 'AUTH_PASSWORD_HASH', 'deadbeef:deadbeef');
    expect(result).toContain('OPENROUTER_API_KEY=abc123');
  });

  it('replaces an existing key in place rather than appending a duplicate', () => {
    const contents = 'AUTH_PASSWORD_HASH=oldvalue\nOPENROUTER_API_KEY=abc123\n';
    const result = upsertEnv(contents, 'AUTH_PASSWORD_HASH', 'newvalue');
    const occurrences = result.match(/^AUTH_PASSWORD_HASH=/gm) ?? [];
    expect(occurrences.length).toBe(1);
    expect(result).toContain('AUTH_PASSWORD_HASH=newvalue');
    expect(result).not.toContain('oldvalue');
  });

  it('does not concatenate onto the last line when contents lack a trailing newline', () => {
    const contents = 'OPENROUTER_API_KEY=abc123';
    const result = upsertEnv(contents, 'AUTH_PASSWORD_HASH', 'deadbeef:deadbeef');
    expect(result).toContain('OPENROUTER_API_KEY=abc123\n');
    expect(result).not.toContain('abc123AUTH_PASSWORD_HASH');
  });
});

describe('the session-secret detection regex used by main()', () => {
  // main() is not exported (it prompts on stdin and exits the process), so this
  // replicates the exact detection regex from scripts/set-password.mjs's main()
  // rather than exporting a predicate purely for this one test.
  const SESSION_SECRET_PRESENT = /^AUTH_SESSION_SECRET=.+$/m;

  it('recognizes an existing non-empty AUTH_SESSION_SECRET as present, not missing', () => {
    const contents = 'OPENROUTER_API_KEY=abc123\nAUTH_SESSION_SECRET=' + 'a'.repeat(64) + '\n';
    expect(SESSION_SECRET_PRESENT.test(contents)).toBe(true);
  });

  it('treats a missing AUTH_SESSION_SECRET as missing', () => {
    const contents = 'OPENROUTER_API_KEY=abc123\n';
    expect(SESSION_SECRET_PRESENT.test(contents)).toBe(false);
  });
});
