'use client';

import { useEffect, useRef, useState } from 'react';
import { Textarea } from '@/components/ui/textarea';

interface CompanyBriefSectionProps {
  jobId: number;
  companyBrief: string | null;
  companyBriefSources: string[] | null;
}

const AUTOSAVE_DELAY_MS = 800;

export default function CompanyBriefSection({ jobId, companyBrief, companyBriefSources }: CompanyBriefSectionProps) {
  const [value, setValue] = useState(companyBrief ?? '');
  const [saveError, setSaveError] = useState<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setValue(companyBrief ?? '');
  }, [companyBrief]);

  function handleChange(next: string) {
    setValue(next);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/jobs/${jobId}/kit`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ field: 'company_brief', value: next }),
        });
        setSaveError(res.ok ? null : 'Could not save your changes.');
      } catch {
        setSaveError('Could not reach the server. Your changes may not be saved.');
      }
    }, AUTOSAVE_DELAY_MS);
  }

  return (
    <section className="flex flex-col gap-xs">
      <h3 className="text-body font-medium text-ink">Company Brief</h3>
      <Textarea aria-label="Company Brief" value={value} onChange={(e) => handleChange(e.target.value)} rows={10} />
      {saveError && <p className="text-body-sm text-red-400">{saveError}</p>}
      {companyBriefSources && companyBriefSources.length > 0 && (
        <ul className="flex flex-col gap-1 text-caption text-ink-subtle">
          {companyBriefSources.map((source) => (
            <li key={source}>
              <a href={source} target="_blank" rel="noreferrer" className="text-accent hover:text-accent-hover">
                {source}
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
