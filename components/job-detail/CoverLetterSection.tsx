'use client';

import { Textarea } from '@/components/ui/textarea';
import { useDebouncedKitSave } from './useDebouncedKitSave';

interface CoverLetterSectionProps {
  jobId: number;
  coverLetter: string | null;
}

export default function CoverLetterSection({ jobId, coverLetter }: CoverLetterSectionProps) {
  const { value, onChange, saveError } = useDebouncedKitSave({
    jobId,
    field: 'cover_letter',
    externalValue: coverLetter ?? '',
    serialize: (text) => text,
  });

  return (
    <section className="flex flex-col gap-xs">
      <h3 className="text-body font-medium text-ink">Cover Letter</h3>
      <Textarea aria-label="Cover Letter" value={value} onChange={(e) => onChange(e.target.value)} rows={10} />
      {saveError && <p className="text-body-sm text-red-400">{saveError}</p>}
    </section>
  );
}
