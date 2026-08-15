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
  id: 1;
  resumeText: string | null;
  resumeFilename: string | null;
  resumeUploadedAt: string | null;
  aboutMe: string | null;
  updatedAt: string;
}
