import {
  buildExtractionPrompt,
  buildCoverLetterPrompt,
  buildBulletsPrompt,
  buildQuestionsPrompt,
  buildCompanyBriefPrompt,
} from './prompts';
import type { Job, Profile } from './types';

const job: Job = {
  id: 1,
  stage: 'wishlist',
  position: 0,
  title: 'Senior Backend Engineer',
  company: 'Acme Corp',
  location: 'Remote',
  salary: '$160k-$190k',
  description: 'Own our payments service and mentor junior engineers.',
  sourceUrl: 'https://acme.example/jobs/42',
  rawInput: 'raw posting text',
  extraFields: null,
  createdAt: '2026-08-15T00:00:00.000Z',
  updatedAt: '2026-08-15T00:00:00.000Z',
};

const profile: Profile = {
  id: 1,
  resumeText: 'Jane Doe — 8 years building backend systems in Go and TypeScript.',
  resumeFilename: 'jane-doe-resume.pdf',
  resumeUploadedAt: '2026-08-01T00:00:00.000Z',
  aboutMe: 'I care most about clean APIs and mentoring.',
  updatedAt: '2026-08-01T00:00:00.000Z',
};

describe('buildExtractionPrompt', () => {
  it('includes the raw posting text and asks for JSON output', () => {
    const prompt = buildExtractionPrompt('Senior Backend Engineer at Acme Corp, Remote, $160k-$190k...');
    expect(prompt).toContain('Senior Backend Engineer at Acme Corp, Remote, $160k-$190k...');
    expect(prompt).toContain('JSON');
    expect(prompt).toContain('title');
    expect(prompt).toContain('company');
  });
});

describe('buildCoverLetterPrompt', () => {
  it('includes the job description and the candidate resume/about-me text', () => {
    const prompt = buildCoverLetterPrompt(job, profile);
    expect(prompt).toContain(job.description as string);
    expect(prompt).toContain(job.title as string);
    expect(prompt).toContain(job.company as string);
    expect(prompt).toContain(profile.resumeText as string);
    expect(prompt).toContain(profile.aboutMe as string);
  });
});

describe('buildBulletsPrompt', () => {
  it('includes the job description and resume text', () => {
    const prompt = buildBulletsPrompt(job, profile);
    expect(prompt).toContain(job.description as string);
    expect(prompt).toContain(profile.resumeText as string);
  });
});

describe('buildQuestionsPrompt', () => {
  it('includes the job description, resume text, and asks for five questions', () => {
    const prompt = buildQuestionsPrompt(job, profile);
    expect(prompt).toContain(job.description as string);
    expect(prompt).toContain(profile.resumeText as string);
    expect(prompt).toContain('five');
  });
});

describe('buildCompanyBriefPrompt', () => {
  it('includes the company name and job title, and does not require profile data', () => {
    const prompt = buildCompanyBriefPrompt(job);
    expect(prompt).toContain(job.company as string);
    expect(prompt).toContain(job.title as string);
  });
});
