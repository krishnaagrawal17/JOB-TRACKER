'use client';

import { useCallback, useEffect, useState } from 'react';
import ProfileForm, { type ProfileFormValues } from '@/components/profile/ProfileForm';

const EMPTY_VALUES: ProfileFormValues = { resumeText: '', aboutMe: '' };
const NETWORK_ERROR_MESSAGE = 'Could not reach the server. Check your connection and try again.';

export default function ProfilePage() {
  const [values, setValues] = useState<ProfileFormValues>(EMPTY_VALUES);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadProfile = useCallback(async () => {
    try {
      const res = await fetch('/api/profile');
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? 'Could not load your profile.');
        return;
      }
      if (json.profile) {
        setValues({ resumeText: json.profile.resumeText ?? '', aboutMe: json.profile.aboutMe ?? '' });
      }
    } catch {
      setError(NETWORK_ERROR_MESSAGE);
    }
  }, []);

  useEffect(() => {
    loadProfile().finally(() => setIsLoading(false));
  }, [loadProfile]);

  async function handleSave() {
    if (isSaving) return;
    setError(null);
    setIsSaving(true);
    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? 'Could not save your profile.');
        return;
      }
      setValues({ resumeText: json.profile.resumeText ?? '', aboutMe: json.profile.aboutMe ?? '' });
    } catch {
      setError(NETWORK_ERROR_MESSAGE);
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return <div className="p-lg text-body text-ink-subtle">Loading...</div>;
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-lg p-lg">
      <h1 className="text-headline text-ink">Profile</h1>
      {error && <p className="text-body-sm text-red-400">{error}</p>}
      <ProfileForm value={values} onChange={setValues} onSave={handleSave} isSaving={isSaving} />
    </main>
  );
}
