'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  closestCenter,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import Column from './Column';
import JobCard from './JobCard';
import { Button } from '@/components/ui/button';
import { STAGES } from '@/lib/types';
import type { Job, Stage } from '@/lib/types';

const NETWORK_ERROR_MESSAGE = 'Could not reach the server. Check your connection and try again.';

type LoadResult = { ok: true; jobs: Job[] } | { ok: false; message: string };

/** Fetches the board, mapping every failure mode (HTTP error, network rejection,
 * unparseable body) onto a message instead of throwing. Callers decide what a
 * failure means: the initial load surfaces it, the post-move refetch ignores it. */
async function fetchJobs(): Promise<LoadResult> {
  try {
    const res = await fetch('/api/jobs');
    const json = await res.json();
    if (!res.ok) {
      return { ok: false, message: json?.error ?? 'Could not load your board.' };
    }
    return { ok: true, jobs: json.jobs ?? [] };
  } catch {
    return { ok: false, message: NETWORK_ERROR_MESSAGE };
  }
}

export function moveJobOptimistically(jobs: Job[], jobId: number, newStage: Stage, newPosition: number): Job[] {
  const job = jobs.find((j) => j.id === jobId);
  if (!job) return jobs;

  const withoutJob = jobs.filter((j) => j.id !== jobId);
  const destinationJobs = withoutJob.filter((j) => j.stage === newStage).sort((a, b) => a.position - b.position);
  const otherJobs = withoutJob.filter((j) => j.stage !== newStage);

  const updatedJob: Job = { ...job, stage: newStage, position: newPosition };
  const clampedPosition = Math.max(0, Math.min(newPosition, destinationJobs.length));
  const reinserted = [...destinationJobs];
  reinserted.splice(clampedPosition, 0, updatedJob);
  const renumberedDestination = reinserted.map((j, index) => ({ ...j, position: index }));

  return [...otherJobs, ...renumberedDestination];
}

function SortableJobCard({ job, onClick }: { job: Job; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: job.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition: transition ?? undefined,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <JobCard job={job} onClick={onClick} />
    </div>
  );
}

function DroppableColumn({
  stage,
  jobs,
  onJobClick,
}: {
  stage: Stage;
  jobs: Job[];
  onJobClick: (job: Job) => void;
}) {
  const { setNodeRef } = useDroppable({ id: stage });

  return (
    <div ref={setNodeRef}>
      <SortableContext items={jobs.map((j) => j.id)} strategy={verticalListSortingStrategy}>
        <Column
          stage={stage}
          jobs={jobs}
          onJobClick={onJobClick}
          renderJob={(job) => <SortableJobCard job={job} onClick={() => onJobClick(job)} />}
        />
      </SortableContext>
    </div>
  );
}

interface BoardProps {
  onJobClick: (job: Job) => void;
}

export default function Board({ onJobClick }: BoardProps) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const loadJobs = useCallback(async () => {
    const result = await fetchJobs();
    if (result.ok) {
      setJobs(result.jobs);
      setLoadError(null);
    } else {
      setLoadError(result.message);
    }
  }, []);

  useEffect(() => {
    loadJobs().finally(() => setIsLoading(false));
  }, [loadJobs]);

  async function handleRetryLoad() {
    setIsLoading(true);
    await loadJobs();
    setIsLoading(false);
  }

  async function persistMove(job: Job, destinationStage: Stage, destinationPosition: number, previousJobs: Job[]) {
    try {
      const res = await fetch(`/api/jobs/${job.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: destinationStage, position: destinationPosition }),
      });
      if (!res.ok) throw new Error('Move failed');
    } catch {
      setJobs(previousJobs);
      return;
    }

    // The server has committed the move. Refetching only reconciles its renumbering
    // with our optimistic state — if that refetch fails, keep the optimistic state
    // rather than rolling back a move that actually succeeded.
    const result = await fetchJobs();
    if (result.ok) setJobs(result.jobs);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    // Dropped back onto itself — always a no-op. Without this, the `overIndex === -1`
    // fallback below would read as "move to the end of the column".
    if (over.id === active.id) return;

    const activeJob = jobs.find((j) => j.id === active.id);
    if (!activeJob) return;

    const overIsStage = (STAGES as readonly string[]).includes(String(over.id));
    const destinationStage: Stage = overIsStage
      ? (over.id as Stage)
      : jobs.find((j) => j.id === over.id)?.stage ?? activeJob.stage;

    const destinationSiblings = jobs
      .filter((j) => j.stage === destinationStage && j.id !== activeJob.id)
      .sort((a, b) => a.position - b.position);

    let destinationPosition: number;
    if (overIsStage) {
      destinationPosition = destinationSiblings.length;
    } else {
      const overIndex = destinationSiblings.findIndex((j) => j.id === over.id);
      if (overIndex === -1) {
        destinationPosition = destinationSiblings.length;
      } else {
        // dnd-kit's drop preview follows arrayMove(items, from, to) where both indices
        // are into the FULL column list, but `destinationSiblings` has the dragged card
        // removed. For a within-stage downward move those indices differ by exactly one
        // (every sibling at or past the dragged card's own slot shifted up by one), so
        // add it back. Upward and cross-stage moves index identically either way.
        const movingDown = destinationStage === activeJob.stage && overIndex >= activeJob.position;
        destinationPosition = movingDown ? overIndex + 1 : overIndex;
      }
    }

    if (destinationStage === activeJob.stage && destinationPosition === activeJob.position) return;

    const previousJobs = jobs;
    setJobs((current) => moveJobOptimistically(current, activeJob.id, destinationStage, destinationPosition));

    void persistMove(activeJob, destinationStage, destinationPosition, previousJobs);
  }

  if (isLoading) {
    return <div className="p-lg text-body text-ink-subtle">Loading board...</div>;
  }

  // A failed load must not render as five empty columns — "no jobs yet" and "the
  // backend is down" look identical otherwise, on the app's home screen.
  if (loadError) {
    return (
      <div className="flex flex-col items-start gap-lg p-lg">
        <p className="text-body-sm text-red-400">{loadError}</p>
        <Button onClick={handleRetryLoad}>Retry</Button>
      </div>
    );
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <div className="flex gap-md overflow-x-auto p-lg">
        {STAGES.map((stage) => (
          <DroppableColumn
            key={stage}
            stage={stage}
            jobs={jobs.filter((j) => j.stage === stage).sort((a, b) => a.position - b.position)}
            onJobClick={onJobClick}
          />
        ))}
      </div>
    </DndContext>
  );
}
