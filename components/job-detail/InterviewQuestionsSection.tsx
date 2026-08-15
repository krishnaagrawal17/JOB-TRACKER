'use client';

import { useEffect, useRef, useState } from 'react';
import { Textarea } from '@/components/ui/textarea';

interface InterviewQuestionsSectionProps {
  jobId: number;
  interviewQuestions: string[] | null;
}

const AUTOSAVE_DELAY_MS = 800;

function questionsToText(questions: string[] | null): string {
  return (questions ?? []).join('\n');
}

function textToQuestions(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export default function InterviewQuestionsSection({ jobId, interviewQuestions }: InterviewQuestionsSectionProps) {
  const [value, setValue] = useState(questionsToText(interviewQuestions));
  const [saveError, setSaveError] = useState<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setValue(questionsToText(interviewQuestions));
  }, [interviewQuestions]);

  function handleChange(next: string) {
    setValue(next);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/jobs/${jobId}/kit`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ field: 'interview_questions', value: textToQuestions(next) }),
        });
        setSaveError(res.ok ? null : 'Could not save your changes.');
      } catch {
        setSaveError('Could not reach the server. Your changes may not be saved.');
      }
    }, AUTOSAVE_DELAY_MS);
  }

  return (
    <section className="flex flex-col gap-xs">
      <h3 className="text-body font-medium text-ink">Interview Questions</h3>
      <Textarea
        aria-label="Interview Questions"
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        rows={6}
      />
      {saveError && <p className="text-body-sm text-red-400">{saveError}</p>}
    </section>
  );
}
