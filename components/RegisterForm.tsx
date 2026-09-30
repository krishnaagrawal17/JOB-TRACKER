'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function RegisterForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting) return;

    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (response.ok) {
        router.replace('/');
        return;
      }
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error ?? 'Could not create account.');
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
        <h1 className="text-h2 text-ink">Create account</h1>
        <p className="mt-xs text-body-sm text-ink-muted">Start tracking your job search today.</p>

        <label htmlFor="register-email" className="mt-lg block text-body-sm text-ink-muted">
          Email
        </label>
        <input
          id="register-email"
          type="email"
          autoFocus
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="mt-xs w-full rounded-md border border-hairline bg-canvas px-sm py-xs text-body text-ink outline-none focus:border-accent"
        />

        <label htmlFor="register-password" className="mt-md block text-body-sm text-ink-muted">
          Password <span className="text-ink-subtle">(min. 8 characters)</span>
        </label>
        <input
          id="register-password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="mt-xs w-full rounded-md border border-hairline bg-canvas px-sm py-xs text-body text-ink outline-none focus:border-accent"
        />

        <label htmlFor="register-confirm" className="mt-md block text-body-sm text-ink-muted">
          Confirm password
        </label>
        <input
          id="register-confirm"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          className="mt-xs w-full rounded-md border border-hairline bg-canvas px-sm py-xs text-body text-ink outline-none focus:border-accent"
        />

        {error && (
          <p role="status" aria-live="polite" className="mt-sm text-body-sm text-red-400">
            {error}
          </p>
        )}

        <Button type="submit" disabled={submitting} className="mt-lg w-full">
          {submitting ? 'Creating account…' : 'Create account'}
        </Button>

        <p className="mt-md text-center text-body-sm text-ink-muted">
          Already have an account?{' '}
          <Link href="/login" className="text-accent hover:underline">
            Sign in
          </Link>
        </p>
      </form>
    </main>
  );
}
