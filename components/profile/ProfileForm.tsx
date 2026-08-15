'use client';

import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import ResumeUpload from './ResumeUpload';

export interface ProfileFormValues {
  resumeText: string;
  aboutMe: string;
}

interface ProfileFormProps {
  value: ProfileFormValues;
  onChange: (value: ProfileFormValues) => void;
  onSave: () => void;
  isSaving: boolean;
}

export default function ProfileForm({ value, onChange, onSave, isSaving }: ProfileFormProps) {
  return (
    <form
      className="flex flex-col gap-md"
      onSubmit={(e) => {
        e.preventDefault();
        onSave();
      }}
    >
      <div className="flex flex-col gap-xs">
        <label className="text-body-sm text-ink-muted" htmlFor="resume-text">
          Resume
        </label>
        <ResumeUpload onExtracted={(resumeText) => onChange({ ...value, resumeText })} />
        <Textarea
          id="resume-text"
          aria-label="Resume text"
          value={value.resumeText}
          onChange={(e) => onChange({ ...value, resumeText: e.target.value })}
          rows={12}
        />
      </div>
      <div className="flex flex-col gap-xs">
        <label className="text-body-sm text-ink-muted" htmlFor="about-me">
          About me
        </label>
        <Textarea
          id="about-me"
          aria-label="About me"
          value={value.aboutMe}
          onChange={(e) => onChange({ ...value, aboutMe: e.target.value })}
          rows={4}
        />
      </div>
      <Button type="submit" disabled={isSaving} className="self-start">
        {isSaving ? 'Saving...' : 'Save Profile'}
      </Button>
    </form>
  );
}
