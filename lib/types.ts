import { z } from 'zod';

export type Stage = 'wishlist' | 'applied' | 'interviewing' | 'offer' | 'rejected';

export const STAGES: readonly Stage[] = ['wishlist', 'applied', 'interviewing', 'offer', 'rejected'];

export interface Job {
  id: number;
  stage: Stage;
  position: number;
  title: string | null;
  company: string | null;
  location: string | null;
  salary: string | null;
  description: string | null;
  sourceUrl: string | null;
  rawInput: string | null;
  extraFields: Record<string, string> | null;
  createdAt: string;
  updatedAt: string;
}

export interface JobKit {
  jobId: number;
  coverLetter: string | null;
  coverLetterGeneratedAt: string | null;
  resumeBullets: string[] | null;
  resumeBulletsGeneratedAt: string | null;
  interviewQuestions: string[] | null;
  interviewQuestionsGeneratedAt: string | null;
  companyBrief: string | null;
  companyBriefGeneratedAt: string | null;
  companyBriefSources: string[] | null;
  modelText: string | null;
  modelWeb: string | null;
}

export interface Profile {
  id: number;
  resumeText: string | null;
  resumeFilename: string | null;
  resumeUploadedAt: string | null;
  aboutMe: string | null;
  updatedAt: string;
}

export const ExtractedJobSchema = z.object({
  title: z.string().nullable().default(null),
  company: z.string().nullable().default(null),
  location: z.string().nullable().default(null),
  salary: z.string().nullable().default(null),
  description: z.string().nullable().default(null),
  sourceUrl: z.string().nullable().default(null),
  extraFields: z.record(z.string()).default({}),
});

export type ExtractedJob = z.infer<typeof ExtractedJobSchema>;
