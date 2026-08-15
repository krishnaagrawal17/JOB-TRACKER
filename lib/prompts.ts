import type { Job, Profile } from './types';

export function buildExtractionPrompt(rawText: string): string {
  return `You are helping a job seeker log a job posting into a tracker. Read the job posting text below and extract structured fields as a single JSON object with exactly these keys: "title" (string or null), "company" (string or null), "location" (string or null), "salary" (string or null, keep the original formatting if present), "description" (string — a cleaned-up plain-text summary of the role and requirements, or null), "sourceUrl" (string or null, only if a URL appears in the text), and "extraFields" (an object of any other useful key/value pairs found, such as "employment_type" or "posted_date" — use an empty object {} if none).

Respond with ONLY the JSON object, no explanation, no markdown code fences.

Job posting text:
"""
${rawText}
"""`;
}

export function buildCoverLetterPrompt(job: Job, profile: Profile): string {
  return `Write a tailored, professional cover letter for the job below, written in the voice of the candidate described by the resume and about-me text. Keep it to 3-4 short paragraphs, no placeholder brackets, ready to send.

Job title: ${job.title ?? 'Unknown title'}
Company: ${job.company ?? 'Unknown company'}
Job description:
"""
${job.description ?? ''}
"""

Candidate resume:
"""
${profile.resumeText ?? ''}
"""

Candidate about-me notes:
"""
${profile.aboutMe ?? ''}
"""

Respond with ONLY the cover letter text.`;
}

export function buildBulletsPrompt(job: Job, profile: Profile): string {
  return `Rewrite 4-6 resume bullet points from the candidate's resume below so they're tailored to the job description below — emphasize the experience and skills most relevant to this specific role, using strong action verbs and (where the original resume supports it) quantified impact. Do not invent experience the resume doesn't support.

Job title: ${job.title ?? 'Unknown title'}
Job description:
"""
${job.description ?? ''}
"""

Candidate resume:
"""
${profile.resumeText ?? ''}
"""

Respond with ONLY a JSON array of bullet point strings, no explanation, no markdown code fences.`;
}

export function buildQuestionsPrompt(job: Job, profile: Profile): string {
  return `Based on the job description and the candidate's resume below, predict the five interview questions this candidate is most likely to be asked for this specific role — mix behavioral and technical/role-specific questions.

Job title: ${job.title ?? 'Unknown title'}
Job description:
"""
${job.description ?? ''}
"""

Candidate resume:
"""
${profile.resumeText ?? ''}
"""

Respond with ONLY a JSON array of exactly five question strings, no explanation, no markdown code fences.`;
}

export function buildCompanyBriefPrompt(job: Job): string {
  return `Write a concise, one-page company brief for a candidate about to interview at ${job.company ?? 'this company'}, for the role of ${job.title ?? 'this role'}. Use current, real information about the company — recent news, product focus, size/stage, culture signals, and anything a candidate should know walking into an interview. Do not fabricate facts you can't find; note briefly if something is uncertain.

Respond with ONLY the brief text, written in plain prose with short section headers, no markdown code fences.`;
}
