'use client';

import { useEffect, useRef, useState } from 'react';
import { Textarea } from '@/components/ui/textarea';

interface ResumeBulletsSectionProps {
  jobId: number;
  resumeBullets: string[] | null;
}

const AUTOSAVE_DELAY_MS = 800;

function bulletsToText(bullets: string[] | null): string {
  return (bullets ?? []).join('\n');
}

function textToBullets(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export default function ResumeBulletsSection({ jobId, resumeBullets }: ResumeBulletsSectionProps) {
  const [value, setValue] = useState(bulletsToText(resumeBullets));
  const [saveError, setSaveError] = useState<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setValue(bulletsToText(resumeBullets));
  }, [resumeBullets]);

  function handleChange(next: string) {
    setValue(next);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/jobs/${jobId}/kit`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ field: 'resume_bullets', value: textToBullets(next) }),
        });
        setSaveError(res.ok ? null : 'Could not save your changes.');
      } catch {
        setSaveError('Could not reach the server. Your changes may not be saved.');
      }
    }, AUTOSAVE_DELAY_MS);
  }

  return (
    <section className="flex flex-col gap-xs">
      <h3 className="text-body font-medium text-ink">Resume Bullets</h3>
      <Textarea aria-label="Resume Bullets" value={value} onChange={(e) => handleChange(e.target.value)} rows={6} />
      {saveError && <p className="text-body-sm text-red-400">{saveError}</p>}
    </section>
  );
}
