'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import type { Job } from '@/lib/types';

const STAGE_LABELS: Record<Job['stage'], string> = {
  wishlist: 'Wishlist',
  applied: 'Applied',
  interviewing: 'Interviewing',
  offer: 'Offer',
  rejected: 'Rejected',
};

interface JobHeaderProps {
  job: Job;
  onEdit: () => void;
  onDelete: () => void;
}

export default function JobHeader({ job, onEdit, onDelete }: JobHeaderProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <div className="flex flex-col gap-sm">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-headline text-ink">{job.title ?? 'Untitled role'}</h1>
          <p className="text-body text-ink-muted">
            {job.company ?? 'Unknown company'}
            {job.location ? ` · ${job.location}` : ''}
          </p>
        </div>
        <Badge variant="subtle">{STAGE_LABELS[job.stage]}</Badge>
      </div>
      {job.salary && <p className="text-body-sm text-ink-subtle">{job.salary}</p>}
      <div className="flex gap-xs">
        <Button variant="outline" onClick={onEdit}>
          Edit
        </Button>
        <Button variant="outline" onClick={() => setConfirmOpen(true)}>
          Delete
        </Button>
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this job?</DialogTitle>
          </DialogHeader>
          <p className="text-body-sm text-ink-muted">This cannot be undone.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                setConfirmOpen(false);
                onDelete();
              }}
            >
              Yes, delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
