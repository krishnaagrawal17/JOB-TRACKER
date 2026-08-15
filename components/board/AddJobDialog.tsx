'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import ExtractedJobForm, { type ExtractedJobFormValues } from './ExtractedJobForm';
import type { Job } from '@/lib/types';

const EMPTY_FORM_VALUES: ExtractedJobFormValues = {
  title: '',
  company: '',
  location: '',
  salary: '',
  description: '',
  sourceUrl: '',
};

interface AddJobDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onJobCreated: (job: Job) => void;
}

export default function AddJobDialog({ open, onOpenChange, onJobCreated }: AddJobDialogProps) {
  const [step, setStep] = useState<'input' | 'preview'>('input');
  const [inputMode, setInputMode] = useState<'url' | 'text'>('url');
  const [url, setUrl] = useState('');
  const [text, setText] = useState('');
  const [formValues, setFormValues] = useState<ExtractedJobFormValues>(EMPTY_FORM_VALUES);
  const [rawText, setRawText] = useState('');
  const [extraFields, setExtraFields] = useState<Record<string, string> | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setStep('input');
    setInputMode('url');
    setUrl('');
    setText('');
    setFormValues(EMPTY_FORM_VALUES);
    setRawText('');
    setExtraFields(null);
    setError(null);
  }

  async function handleExtract() {
    setError(null);
    setIsExtracting(true);
    try {
      const body = inputMode === 'url' ? { url } : { text };
      const res = await fetch('/api/jobs/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();

      if (!res.ok) {
        if (json.blocked) {
          setInputMode('text');
          setError(json.error ?? 'Could not fetch that URL — paste the job description instead.');
          return;
        }
        setError(json.error ?? 'Extraction failed.');
        return;
      }

      setFormValues({
        title: json.extracted.title ?? '',
        company: json.extracted.company ?? '',
        location: json.extracted.location ?? '',
        salary: json.extracted.salary ?? '',
        description: json.extracted.description ?? '',
        sourceUrl: json.extracted.sourceUrl ?? (inputMode === 'url' ? url : ''),
      });
      setRawText(json.rawText);
      setExtraFields(json.extracted.extraFields ?? null);
      setStep('preview');
    } finally {
      setIsExtracting(false);
    }
  }

  async function handleConfirm() {
    setError(null);
    const res = await fetch('/api/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: formValues.title,
        company: formValues.company,
        location: formValues.location,
        salary: formValues.salary,
        description: formValues.description,
        sourceUrl: formValues.sourceUrl,
        rawInput: rawText,
        extraFields,
      }),
    });
    const json = await res.json();

    if (!res.ok) {
      setError(json.error ?? 'Could not create the job.');
      return;
    }

    onJobCreated(json.job);
    reset();
    onOpenChange(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{step === 'input' ? 'Add a job' : 'Confirm job details'}</DialogTitle>
        </DialogHeader>

        {step === 'input' && (
          <div className="flex flex-col gap-sm">
            <Tabs value={inputMode} onValueChange={(v) => setInputMode(v as 'url' | 'text')}>
              <TabsList>
                <TabsTrigger value="url">URL</TabsTrigger>
                <TabsTrigger value="text">Paste text</TabsTrigger>
              </TabsList>
              <TabsContent value="url">
                <Input
                  aria-label="Job posting URL"
                  placeholder="https://company.example/careers/job-id"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                />
              </TabsContent>
              <TabsContent value="text">
                <Textarea
                  aria-label="Job posting text"
                  placeholder="Paste the job description here"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={8}
                />
              </TabsContent>
            </Tabs>
            {error && <p className="text-body-sm text-red-400">{error}</p>}
            <Button
              onClick={handleExtract}
              disabled={isExtracting || (inputMode === 'url' ? url.trim().length === 0 : text.trim().length === 0)}
            >
              {isExtracting ? 'Extracting...' : 'Extract'}
            </Button>
          </div>
        )}

        {step === 'preview' && (
          <div className="flex flex-col gap-sm">
            {error && <p className="text-body-sm text-red-400">{error}</p>}
            <ExtractedJobForm
              value={formValues}
              onChange={setFormValues}
              onSubmit={handleConfirm}
              submitLabel="Add Job"
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
