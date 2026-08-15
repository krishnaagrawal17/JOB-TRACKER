'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import JobHeader from '@/components/job-detail/JobHeader';
import JobDescription from '@/components/job-detail/JobDescription';
import KitPanel from '@/components/job-detail/KitPanel';
import ExtractedJobForm, { type ExtractedJobFormValues } from '@/components/board/ExtractedJobForm';
import type { Job, JobKit } from '@/lib/types';

export default function JobDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [job, setJob] = useState<Job | null>(null);
  const [kit, setKit] = useState<JobKit | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [formValues, setFormValues] = useState<ExtractedJobFormValues | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadJob = useCallback(async () => {
    try {
      const res = await fetch(`/api/jobs/${params.id}`);
      if (!res.ok) {
        setError('Could not load this job.');
        return;
      }
      const json = await res.json();
      setJob(json.job);
      setKit(json.kit);
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
    }
  }, [params.id]);

  useEffect(() => {
    loadJob();
  }, [loadJob]);

  function startEditing() {
    if (!job) return;
    setFormValues({
      title: job.title ?? '',
      company: job.company ?? '',
      location: job.location ?? '',
      salary: job.salary ?? '',
      description: job.description ?? '',
      sourceUrl: job.sourceUrl ?? '',
    });
    setIsEditing(true);
  }

  async function handleSaveEdit() {
    if (!formValues || isSaving) return;
    setIsSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/jobs/${params.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formValues),
      });
      if (!res.ok) {
        setError('Could not save your changes.');
        return;
      }
      setIsEditing(false);
      await loadJob();
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete() {
    if (isDeleting) return;
    setIsDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/jobs/${params.id}`, { method: 'DELETE' });
      if (!res.ok) {
        setError('Could not delete this job.');
        return;
      }
      router.push('/');
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
    } finally {
      setIsDeleting(false);
    }
  }

  if (!job) {
    return <div className="p-lg text-body text-ink-subtle">{error ?? 'Loading...'}</div>;
  }

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-lg p-lg">
      {error && <p className="text-body-sm text-red-400">{error}</p>}
      <JobHeader job={job} onEdit={startEditing} onDelete={handleDelete} />
      {isEditing && formValues ? (
        <ExtractedJobForm
          value={formValues}
          onChange={setFormValues}
          onSubmit={handleSaveEdit}
          submitLabel={isSaving ? 'Saving...' : 'Save'}
        />
      ) : (
        <JobDescription job={job} />
      )}
      <KitPanel jobId={job.id} kit={kit} />
    </main>
  );
}
