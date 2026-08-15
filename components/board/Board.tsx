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
import { STAGES } from '@/lib/types';
import type { Job, Stage } from '@/lib/types';

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
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const loadJobs = useCallback(async () => {
    const res = await fetch('/api/jobs');
    const json = await res.json();
    setJobs(json.jobs ?? []);
  }, []);

  useEffect(() => {
    loadJobs().finally(() => setIsLoading(false));
  }, [loadJobs]);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;

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
      destinationPosition = overIndex === -1 ? destinationSiblings.length : overIndex;
    }

    if (destinationStage === activeJob.stage && destinationPosition === activeJob.position) return;

    const previousJobs = jobs;
    setJobs((current) => moveJobOptimistically(current, activeJob.id, destinationStage, destinationPosition));

    fetch(`/api/jobs/${activeJob.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stage: destinationStage, position: destinationPosition }),
    })
      .then((res) => {
        if (!res.ok) throw new Error('Move failed');
        return loadJobs();
      })
      .catch(() => {
        setJobs(previousJobs);
      });
  }

  if (isLoading) {
    return <div className="p-lg text-body text-ink-subtle">Loading board...</div>;
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
