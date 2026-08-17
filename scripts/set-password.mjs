#!/usr/bin/env node
/**
 * Interactive one-time setup: writes AUTH_PASSWORD_HASH and AUTH_SESSION_SECRET
 * into .env.local, preserving any values already there (notably OPENROUTER_API_KEY).
 * Run with: npm run set-password
 *
 * Duplicates the scrypt parameters from lib/auth/password.ts (N=16384, r=8, p=1,
 * 32-byte key, 16-byte salt) rather than importing them, because this is plain ESM
 * run by bare `node` and lib/auth/password.ts is TypeScript. Drift between the two
 * would write a hash the app cannot verify. scripts/set-password.test.ts guards
 * against that by asserting interop with lib/auth/password.ts's verifyPassword
 * directly, rather than eyeballing that the constants match.
 */
import { randomBytes, scrypt } from 'node:crypto';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const scryptAsync = promisify(scrypt);
const ENV_PATH = path.join(process.cwd(), '.env.local');

function promptHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const onData = (char) => {
      if (['\n', '\r', ''].includes(char.toString())) {
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

export function upsertEnv(contents, key, value) {
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, 'm');
  if (pattern.test(contents)) return contents.replace(pattern, line);
  return contents.length && !contents.endsWith('\n') ? `${contents}\n${line}\n` : `${contents}${line}\n`;
}

export function hasSessionSecret(contents) {
  return /^AUTH_SESSION_SECRET=.+$/m.test(contents);
}

export async function hashPasswordForSetup(password) {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, 32, { N: 16384, r: 8, p: 1 });
  return `${salt.toString('hex')}:${key.toString('hex')}`;
}

async function main() {
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

  const hash = await hashPasswordForSetup(password);

  let contents = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, 'utf8') : '';
  contents = upsertEnv(contents, 'AUTH_PASSWORD_HASH', hash);
  if (!hasSessionSecret(contents)) {
    contents = upsertEnv(contents, 'AUTH_SESSION_SECRET', randomBytes(32).toString('hex'));
    console.log('Generated a new session secret.');
  } else {
    console.log('Kept the existing session secret, so you stay logged in elsewhere.');
  }

  fs.writeFileSync(ENV_PATH, contents, { mode: 0o600 });
  console.log(`Password saved to ${ENV_PATH}. Restart the app for it to take effect.`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main();
}
