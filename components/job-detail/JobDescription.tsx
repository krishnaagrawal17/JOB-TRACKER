import type { Job } from '@/lib/types';

interface JobDescriptionProps {
  job: Job;
}

export default function JobDescription({ job }: JobDescriptionProps) {
  return (
    <div className="flex flex-col gap-xs">
      <h2 className="text-body font-medium text-ink">Description</h2>
      <p className="whitespace-pre-wrap text-body text-ink-muted">{job.description ?? 'No description.'}</p>
    </div>
  );
}
