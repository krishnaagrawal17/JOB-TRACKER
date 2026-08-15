'use client';

import { Textarea } from '@/components/ui/textarea';
import { useDebouncedKitSave } from './useDebouncedKitSave';

interface CompanyBriefSectionProps {
  jobId: number;
  companyBrief: string | null;
  companyBriefSources: string[] | null;
}

export default function CompanyBriefSection({ jobId, companyBrief, companyBriefSources }: CompanyBriefSectionProps) {
  const { value, onChange, saveError } = useDebouncedKitSave({
    jobId,
    field: 'company_brief',
    externalValue: companyBrief ?? '',
    serialize: (text) => text,
  });

  return (
    <section className="flex flex-col gap-xs">
      <h3 className="text-body font-medium text-ink">Company Brief</h3>
      <Textarea aria-label="Company Brief" value={value} onChange={(e) => onChange(e.target.value)} rows={10} />
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
