'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';

/**
 * Only same-origin absolute paths are accepted. Without this, `?next=https://evil.com`
 * would bounce a freshly authenticated user to an attacker's page — an open redirect.
 * Control characters (C0 range and DEL) are rejected first: WHATWG URL parsing strips them
 * before resolving, so a value that looks like a safe relative path here — e.g. `/\t/evil.com`
 * — can still resolve to an external origin once the router builds a URL from it.
 */
function safeNextPath(value: string | null): string {
  if (value && /[\x00-\x1F\x7F]/.test(value)) return '/';
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
