'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Board from '@/components/board/Board';
import AddJobDialog from '@/components/board/AddJobDialog';
import { Button } from '@/components/ui/button';
import type { Job } from '@/lib/types';

export default function Home() {
  const router = useRouter();
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [boardKey, setBoardKey] = useState(0);

  function handleJobClick(job: Job) {
    router.push(`/jobs/${job.id}`);
  }

  function handleJobCreated() {
    setBoardKey((k) => k + 1);
  }

  return (
    <main className="flex min-h-screen flex-col">
      <div className="flex items-center justify-between px-lg pt-lg">
        <h1 className="text-headline text-ink">Job Tracker</h1>
        <Button onClick={() => setIsAddOpen(true)}>Add Job</Button>
      </div>
      <Board key={boardKey} onJobClick={handleJobClick} />
      <AddJobDialog open={isAddOpen} onOpenChange={setIsAddOpen} onJobCreated={handleJobCreated} />
    </main>
  );
}
