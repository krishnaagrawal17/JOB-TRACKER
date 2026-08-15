import { render, screen, fireEvent } from '@testing-library/react';
import CoverLetterSection from './CoverLetterSection';

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

describe('CoverLetterSection', () => {
  it('renders the given cover letter text', () => {
    render(<CoverLetterSection jobId={1} coverLetter="Dear hiring manager..." />);
    expect(screen.getByLabelText('Cover Letter')).toHaveValue('Dear hiring manager...');
  });

  it('debounces autosave — does not PATCH immediately on keystroke', () => {
    render(<CoverLetterSection jobId={1} coverLetter="" />);
    fireEvent.change(screen.getByLabelText('Cover Letter'), { target: { value: 'Edited text' } });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('PATCHes the edited value after the debounce delay', () => {
    render(<CoverLetterSection jobId={1} coverLetter="" />);
    fireEvent.change(screen.getByLabelText('Cover Letter'), { target: { value: 'Edited text' } });
    vi.advanceTimersByTime(800);
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/jobs/1/kit',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ field: 'cover_letter', value: 'Edited text' }),
      })
    );
  });
});
