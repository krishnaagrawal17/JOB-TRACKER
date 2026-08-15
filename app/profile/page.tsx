'use client';

import { useCallback, useEffect, useState } from 'react';
import ProfileForm, { type ProfileFormValues } from '@/components/profile/ProfileForm';
import { Button } from '@/components/ui/button';

const EMPTY_VALUES: ProfileFormValues = { resumeText: '', aboutMe: '' };
const NETWORK_ERROR_MESSAGE = 'Could not reach the server. Check your connection and try again.';

export default function ProfilePage() {
  const [values, setValues] = useState<ProfileFormValues>(EMPTY_VALUES);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  // Kept separate from saveError: a failed load must block the form entirely
  // (see loadError render branch below) rather than share a banner with
  // save-time errors, which appear above a form that's already usable.
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const loadProfile = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await fetch('/api/profile');
      const json = await res.json();
      if (!res.ok) {
        setLoadError(json.error ?? 'Could not load your profile.');
        return;
      }
      if (json.profile) {
        setValues({ resumeText: json.profile.resumeText ?? '', aboutMe: json.profile.aboutMe ?? '' });
      }
    } catch {
      setLoadError(NETWORK_ERROR_MESSAGE);
    }
  }, []);

  useEffect(() => {
    loadProfile().finally(() => setIsLoading(false));
  }, [loadProfile]);

  async function handleRetryLoad() {
    setIsLoading(true);
    await loadProfile();
    setIsLoading(false);
  }

  async function handleSave() {
    if (isSaving) return;
    setSaveError(null);
    setIsSaving(true);
    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      const json = await res.json();
      if (!res.ok) {
        setSaveError(json.error ?? 'Could not save your profile.');
        return;
      }
      // Success: `values` already holds exactly what was just sent, so there's
      // nothing to reconcile. Echoing the server's response back into state here
      // would revert any edit typed between clicking Save and the response landing.
    } catch {
      setSaveError(NETWORK_ERROR_MESSAGE);
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return <div className="p-lg text-body text-ink-subtle">Loading...</div>;
  }

  // A failed load must never fall through to a blank, savable form: saving it
  // would PATCH empty strings over whatever profile is actually stored. Show a
  // retry instead of the form until a load has succeeded.
  if (loadError) {
    return (
      <main className="mx-auto flex max-w-2xl flex-col gap-lg p-lg">
        <h1 className="text-headline text-ink">Profile</h1>
        <p className="text-body-sm text-red-400">{loadError}</p>
        <Button onClick={handleRetryLoad} className="self-start">
          Retry
        </Button>
      </main>
    );
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-lg p-lg">
      <h1 className="text-headline text-ink">Profile</h1>
      {saveError && <p className="text-body-sm text-red-400">{saveError}</p>}
      <ProfileForm value={values} onChange={setValues} onSave={handleSave} isSaving={isSaving} />
    </main>
  );
}
