'use client';

import { useState } from 'react';

interface ResumeUploadProps {
  onExtracted: (resumeText: string, filename: string) => void;
}

export default function ResumeUpload({ onExtracted }: ResumeUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    if (isUploading) return;
    setError(null);
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('resume', file);
      const res = await fetch('/api/profile/resume', { method: 'POST', body: formData });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? 'Upload failed.');
        return;
      }
      onExtracted(json.profile.resumeText ?? '', json.profile.resumeFilename ?? file.name);
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
    } finally {
      setIsUploading(false);
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Reset the input so selecting the same file again (e.g. after a failed
    // upload) still fires a change event instead of being a silent no-op.
    e.target.value = '';
    if (file) handleFile(file);
  }

  function handleDrop(e: React.DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) handleFile(file);
  }

  function handleDragOver(e: React.DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setIsDragging(true);
  }

  return (
    <div className="flex flex-col gap-xs">
      <label
        className={`flex h-24 flex-col items-center justify-center rounded-md border-2 border-dashed text-center text-body-sm text-ink-subtle transition-colors ${
          isDragging ? 'border-accent' : 'border-hairline hover:border-accent'
        }`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={() => setIsDragging(false)}
      >
        {isUploading ? 'Uploading...' : 'Drag & drop, or click to upload a PDF or DOCX resume'}
        <input
          type="file"
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          aria-label="Upload resume"
          className="hidden"
          disabled={isUploading}
          onChange={handleChange}
        />
      </label>
      {error && <p className="text-body-sm text-red-400">{error}</p>}
    </div>
  );
}
