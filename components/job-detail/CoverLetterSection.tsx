'use client';

import { useEffect, useRef, useState } from 'react';
import { Textarea } from '@/components/ui/textarea';

interface CoverLetterSectionProps {
  jobId: number;
  coverLetter: string | null;
}

const AUTOSAVE_DELAY_MS = 800;

export default function CoverLetterSection({ jobId, coverLetter }: CoverLetterSectionProps) {
  const [value, setValue] = useState(coverLetter ?? '');
  const [saveError, setSaveError] = useState<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setValue(coverLetter ?? '');
  }, [coverLetter]);

  function handleChange(next: string) {
    setValue(next);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/jobs/${jobId}/kit`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ field: 'cover_letter', value: next }),
        });
        setSaveError(res.ok ? null : 'Could not save your changes.');
      } catch {
        setSaveError('Could not reach the server. Your changes may not be saved.');
      }
    }, AUTOSAVE_DELAY_MS);
  }

  return (
    <section className="flex flex-col gap-xs">
      <h3 className="text-body font-medium text-ink">Cover Letter</h3>
      <Textarea aria-label="Cover Letter" value={value} onChange={(e) => handleChange(e.target.value)} rows={10} />
      {saveError && <p className="text-body-sm text-red-400">{saveError}</p>}
    </section>
  );
}
