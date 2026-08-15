import { render, screen, fireEvent } from '@testing-library/react';
import InterviewQuestionsSection from './InterviewQuestionsSection';

const originalFetch = global.fetch;

beforeEach(() => {
  vi.useFakeTimers();
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }) as unknown as typeof fetch;
});

afterEach(() => {
  vi.useRealTimers();
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('InterviewQuestionsSection', () => {
  it('renders questions one per line', () => {
    render(<InterviewQuestionsSection jobId={1} interviewQuestions={['Q1', 'Q2']} />);
    expect(screen.getByLabelText('Interview Questions')).toHaveValue('Q1\nQ2');
  });

  it('PATCHes the parsed question array after the debounce delay', () => {
    render(<InterviewQuestionsSection jobId={1} interviewQuestions={[]} />);
    fireEvent.change(screen.getByLabelText('Interview Questions'), {
      target: { value: 'New question one\nNew question two' },
    });
    vi.advanceTimersByTime(800);
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/jobs/1/kit',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ field: 'interview_questions', value: ['New question one', 'New question two'] }),
      })
    );
  });
});
