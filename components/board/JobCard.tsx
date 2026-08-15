import type { Job } from '@/lib/types';
import { cn } from '@/lib/utils';

interface JobCardProps {
  job: Job;
  onClick?: () => void;
  className?: string;
}

export default function JobCard({ job, onClick, className }: JobCardProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onClick?.();
      }}
      className={cn(
        'cursor-pointer rounded-lg border border-hairline bg-surface-1 p-md text-left transition-colors hover:bg-surface-2',
        className
      )}
    >
      <h3 className="text-card-title text-ink">{job.title ?? 'Untitled role'}</h3>
      {job.company && <p className="text-body-sm text-ink-muted">{job.company}</p>}
      <div className="mt-xs flex flex-wrap gap-xs text-caption text-ink-subtle">
        {job.location && <span>{job.location}</span>}
        {job.salary && <span>{job.salary}</span>}
      </div>
    </div>
  );
}
