'use client';

import { Textarea } from '@/components/ui/textarea';
import { useDebouncedKitSave, linesToText, textToLines } from './useDebouncedKitSave';

interface InterviewQuestionsSectionProps {
  jobId: number;
  interviewQuestions: string[] | null;
}

export default function InterviewQuestionsSection({ jobId, interviewQuestions }: InterviewQuestionsSectionProps) {
  const { value, onChange, saveError } = useDebouncedKitSave({
    jobId,
    field: 'interview_questions',
    externalValue: linesToText(interviewQuestions),
    serialize: textToLines,
  });

  return (
    <section className="flex flex-col gap-xs">
      <h3 className="text-body font-medium text-ink">Interview Questions</h3>
      <Textarea
        aria-label="Interview Questions"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={6}
      />
      {saveError && <p className="text-body-sm text-red-400">{saveError}</p>}
    </section>
  );
}
