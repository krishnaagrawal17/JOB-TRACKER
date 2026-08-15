'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import CoverLetterSection from './CoverLetterSection';
import ResumeBulletsSection from './ResumeBulletsSection';
import InterviewQuestionsSection from './InterviewQuestionsSection';
import CompanyBriefSection from './CompanyBriefSection';
import type { JobKit } from '@/lib/types';

interface KitPanelProps {
  jobId: number;
  kit: JobKit | null;
}

export default function KitPanel({ jobId, kit }: KitPanelProps) {
  const [currentKit, setCurrentKit] = useState<JobKit | null>(kit);
  const [isGenerating, setIsGenerating] = useState(false);
  const [partialErrors, setPartialErrors] = useState<Record<string, string>>({});
  const [generateError, setGenerateError] = useState<string | null>(null);

  async function handleGenerate() {
    if (isGenerating) return;
    setIsGenerating(true);
    setPartialErrors({});
    setGenerateError(null);
    try {
      const res = await fetch(`/api/jobs/${jobId}/kit`, { method: 'POST' });
      if (!res.ok) {
        setGenerateError('Could not generate the kit. Try again.');
        return;
      }
      const json = await res.json();
      setCurrentKit(json.kit);
      if (json.partial) {
        setPartialErrors(json.errors);
      }
    } catch {
      setGenerateError('Could not reach the server. Check your connection and try again.');
    } finally {
      setIsGenerating(false);
    }
  }

  const hasKit = Boolean(
    currentKit &&
      (currentKit.coverLetter || currentKit.resumeBullets || currentKit.interviewQuestions || currentKit.companyBrief)
  );
  const errorCount = Object.keys(partialErrors).length;

  return (
    <div className="flex flex-col gap-md rounded-lg border border-hairline bg-surface-1 p-lg">
      <div className="flex items-center justify-between">
        <h2 className="text-card-title text-ink">Kit</h2>
        <Button onClick={handleGenerate} disabled={isGenerating}>
          {isGenerating ? 'Generating...' : hasKit ? 'Regenerate' : 'Generate Kit'}
        </Button>
      </div>

      {generateError && (
        <p className="text-body-sm text-red-400" role="alert">
          {generateError}
        </p>
      )}

      {errorCount > 0 && (
        <p className="text-body-sm text-red-400" role="alert">
          {errorCount} of 4 sections failed to generate — click Regenerate to retry.
        </p>
      )}

      {!hasKit && !isGenerating && <p className="text-body-sm text-ink-subtle">No kit generated yet.</p>}

      {currentKit && (
        <div className="flex flex-col gap-md">
          <CoverLetterSection jobId={jobId} coverLetter={currentKit.coverLetter} />
          <ResumeBulletsSection jobId={jobId} resumeBullets={currentKit.resumeBullets} />
          <InterviewQuestionsSection jobId={jobId} interviewQuestions={currentKit.interviewQuestions} />
          <CompanyBriefSection
            jobId={jobId}
            companyBrief={currentKit.companyBrief}
            companyBriefSources={currentKit.companyBriefSources}
          />
        </div>
      )}
    </div>
  );
}
