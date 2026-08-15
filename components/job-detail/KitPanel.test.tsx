import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import KitPanel from './KitPanel';
import type { JobKit } from '@/lib/types';

vi.mock('./CoverLetterSection', () => ({ default: () => <div>mock-cover-letter</div> }));
vi.mock('./ResumeBulletsSection', () => ({ default: () => <div>mock-resume-bullets</div> }));
vi.mock('./InterviewQuestionsSection', () => ({ default: () => <div>mock-interview-questions</div> }));
vi.mock('./CompanyBriefSection', () => ({ default: () => <div>mock-company-brief</div> }));

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('KitPanel', () => {
  it('shows "No kit generated yet." and a Generate Kit button when there is no kit', () => {
    render(<KitPanel jobId={1} kit={null} />);
    expect(screen.getByText('No kit generated yet.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Generate Kit' })).toBeInTheDocument();
  });

  it('shows the four sections and a Regenerate button when a kit already exists', () => {
    const kit: JobKit = {
      jobId: 1,
      coverLetter: 'Dear hiring manager...',
      coverLetterGeneratedAt: '2026-08-15T00:00:00.000Z',
      resumeBullets: ['Bullet one'],
      resumeBulletsGeneratedAt: '2026-08-15T00:00:00.000Z',
      interviewQuestions: ['Q1', 'Q2', 'Q3', 'Q4', 'Q5'],
      interviewQuestionsGeneratedAt: '2026-08-15T00:00:00.000Z',
      companyBrief: 'Acme is a company...',
      companyBriefGeneratedAt: '2026-08-15T00:00:00.000Z',
      companyBriefSources: null,
      modelText: 'text-model-slug',
      modelWeb: 'web-model-slug',
    };
    render(<KitPanel jobId={1} kit={kit} />);
    expect(screen.getByRole('button', { name: 'Regenerate' })).toBeInTheDocument();
    expect(screen.getByText('mock-cover-letter')).toBeInTheDocument();
    expect(screen.getByText('mock-resume-bullets')).toBeInTheDocument();
    expect(screen.getByText('mock-interview-questions')).toBeInTheDocument();
    expect(screen.getByText('mock-company-brief')).toBeInTheDocument();
  });

  it('calls the kit generation endpoint and shows a partial-failure banner', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        kit: {
          jobId: 1,
          coverLetter: 'Dear hiring manager...',
          coverLetterGeneratedAt: '2026-08-15T00:00:00.000Z',
          resumeBullets: ['Bullet one'],
          resumeBulletsGeneratedAt: '2026-08-15T00:00:00.000Z',
          interviewQuestions: ['Q1', 'Q2', 'Q3', 'Q4', 'Q5'],
          interviewQuestionsGeneratedAt: '2026-08-15T00:00:00.000Z',
          companyBrief: null,
          companyBriefGeneratedAt: null,
          companyBriefSources: null,
          modelText: 'text-model-slug',
          modelWeb: null,
        },
        partial: true,
        errors: { company_brief: 'web search unavailable' },
      }),
    }) as unknown as typeof fetch;

    render(<KitPanel jobId={1} kit={null} />);
    fireEvent.click(screen.getByRole('button', { name: 'Generate Kit' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('1 of 4 sections failed');
    });
    expect(global.fetch).toHaveBeenCalledWith('/api/jobs/1/kit', { method: 'POST' });
  });
});
