'use client';

import { Textarea } from '@/components/ui/textarea';
import { useDebouncedKitSave, linesToText, textToLines } from './useDebouncedKitSave';

interface ResumeBulletsSectionProps {
  jobId: number;
  resumeBullets: string[] | null;
}

export default function ResumeBulletsSection({ jobId, resumeBullets }: ResumeBulletsSectionProps) {
  const { value, onChange, saveError } = useDebouncedKitSave({
    jobId,
    field: 'resume_bullets',
    externalValue: linesToText(resumeBullets),
    serialize: textToLines,
  });

  return (
    <section className="flex flex-col gap-xs">
      <h3 className="text-body font-medium text-ink">Resume Bullets</h3>
      <Textarea aria-label="Resume Bullets" value={value} onChange={(e) => onChange(e.target.value)} rows={6} />
      {saveError && <p className="text-body-sm text-red-400">{saveError}</p>}
    </section>
  );
}
