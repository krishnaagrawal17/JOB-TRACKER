'use client';

import { useEffect, useRef, useState } from 'react';

/** Mirrors lib/db.ts's KitField without importing from a server-only module
 * (better-sqlite3) into client bundles. */
export type EditableKitField = 'cover_letter' | 'resume_bullets' | 'interview_questions' | 'company_brief';

const AUTOSAVE_DELAY_MS = 800;

interface UseDebouncedKitSaveOptions {
  jobId: number;
  field: EditableKitField;
  /** The current server-backed text, converted to a plain string by the caller. */
  externalValue: string;
  /** Converts the textarea's text into the shape the PATCH body expects for this field. */
  serialize: (text: string) => string | string[];
}

interface UseDebouncedKitSaveResult {
  value: string;
  onChange: (next: string) => void;
  saveError: string | null;
}

/** Debounced (800ms) autosave for a single kit textarea field. PATCHes
 * `/api/jobs/[jobId]/kit` after the user stops typing, surfaces a visible error on
 * network/HTTP failure, and guards against a slow, superseded save silently
 * overwriting a newer save's outcome: only the response belonging to the most
 * recently dispatched request is ever applied. */
export function useDebouncedKitSave({
  jobId,
  field,
  externalValue,
  serialize,
}: UseDebouncedKitSaveOptions): UseDebouncedKitSaveResult {
  const [value, setValue] = useState(externalValue);
  const [saveError, setSaveError] = useState<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setValue(externalValue);
  }, [externalValue]);

  function onChange(next: string) {
    setValue(next);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      dispatchSave(next);
    }, AUTOSAVE_DELAY_MS);
  }

  async function dispatchSave(next: string) {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch(`/api/jobs/${jobId}/kit`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ field, value: serialize(next) }),
        signal: controller.signal,
      });
      if (abortRef.current !== controller) return; // superseded by a newer save
      setSaveError(res.ok ? null : 'Could not save your changes.');
    } catch (err) {
      if (abortRef.current !== controller) return; // superseded, including a deliberate abort
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setSaveError('Could not reach the server. Your changes may not be saved.');
    }
  }

  return { value, onChange, saveError };
}

export function linesToText(lines: string[] | null): string {
  return (lines ?? []).join('\n');
}

export function textToLines(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}
