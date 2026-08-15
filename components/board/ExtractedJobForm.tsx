'use client';

import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';

export interface ExtractedJobFormValues {
  title: string;
  company: string;
  location: string;
  salary: string;
  description: string;
  sourceUrl: string;
}

interface ExtractedJobFormProps {
  value: ExtractedJobFormValues;
  onChange: (value: ExtractedJobFormValues) => void;
  onSubmit: () => void;
  submitLabel: string;
}

export default function ExtractedJobForm({ value, onChange, onSubmit, submitLabel }: ExtractedJobFormProps) {
  function setField<K extends keyof ExtractedJobFormValues>(field: K, fieldValue: string) {
    onChange({ ...value, [field]: fieldValue });
  }

  return (
    <form
      className="flex flex-col gap-sm"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <label className="flex flex-col gap-1 text-body-sm text-ink-muted">
        Title
        <Input value={value.title} onChange={(e) => setField('title', e.target.value)} aria-label="Title" />
      </label>
      <label className="flex flex-col gap-1 text-body-sm text-ink-muted">
        Company
        <Input value={value.company} onChange={(e) => setField('company', e.target.value)} aria-label="Company" />
      </label>
      <label className="flex flex-col gap-1 text-body-sm text-ink-muted">
        Location
        <Input value={value.location} onChange={(e) => setField('location', e.target.value)} aria-label="Location" />
      </label>
      <label className="flex flex-col gap-1 text-body-sm text-ink-muted">
        Salary
        <Input value={value.salary} onChange={(e) => setField('salary', e.target.value)} aria-label="Salary" />
      </label>
      <label className="flex flex-col gap-1 text-body-sm text-ink-muted">
        Source URL
        <Input value={value.sourceUrl} onChange={(e) => setField('sourceUrl', e.target.value)} aria-label="Source URL" />
      </label>
      <label className="flex flex-col gap-1 text-body-sm text-ink-muted">
        Description
        <Textarea
          value={value.description}
          onChange={(e) => setField('description', e.target.value)}
          aria-label="Description"
          rows={6}
        />
      </label>
      <Button type="submit">{submitLabel}</Button>
    </form>
  );
}
