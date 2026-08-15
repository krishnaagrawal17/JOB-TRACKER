import type { Job, Stage } from '@/lib/types';
import JobCard from './JobCard';

const STAGE_LABELS: Record<Stage, string> = {
  wishlist: 'Wishlist',
  applied: 'Applied',
  interviewing: 'Interviewing',
  offer: 'Offer',
  rejected: 'Rejected',
};

interface ColumnProps {
  stage: Stage;
  jobs: Job[];
  onJobClick: (job: Job) => void;
  renderJob?: (job: Job) => React.ReactNode;
}

export default function Column({ stage, jobs, onJobClick, renderJob }: ColumnProps) {
  return (
    <div className="flex w-72 flex-shrink-0 flex-col rounded-lg border border-hairline bg-surface-1 p-sm">
      <div className="mb-sm flex items-center justify-between px-xs">
        <h2 className="text-body font-medium text-ink">{STAGE_LABELS[stage]}</h2>
        <span className="rounded-full bg-surface-2 px-xs py-0.5 text-caption text-ink-muted">{jobs.length}</span>
      </div>
      <div className="flex flex-col gap-xs">
        {jobs.map((job) => (
          <div key={job.id}>{renderJob ? renderJob(job) : <JobCard job={job} onClick={() => onJobClick(job)} />}</div>
        ))}
      </div>
    </div>
  );
}
