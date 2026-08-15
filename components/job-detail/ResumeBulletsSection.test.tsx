import { render, screen, fireEvent } from '@testing-library/react';
import ResumeBulletsSection from './ResumeBulletsSection';

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

describe('ResumeBulletsSection', () => {
  it('renders bullets one per line', () => {
    render(<ResumeBulletsSection jobId={1} resumeBullets={['Led migration', 'Cut latency 30%']} />);
    expect(screen.getByLabelText('Resume Bullets')).toHaveValue('Led migration\nCut latency 30%');
  });

  it('PATCHes the parsed bullet array after the debounce delay', () => {
    render(<ResumeBulletsSection jobId={1} resumeBullets={[]} />);
    fireEvent.change(screen.getByLabelText('Resume Bullets'), { target: { value: 'Bullet one\nBullet two\n' } });
    vi.advanceTimersByTime(800);
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/jobs/1/kit',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ field: 'resume_bullets', value: ['Bullet one', 'Bullet two'] }),
      })
    );
  });
});
