import { render, screen, fireEvent } from '@testing-library/react';
import CompanyBriefSection from './CompanyBriefSection';

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

describe('CompanyBriefSection', () => {
  it('renders the brief text and citation links when sources are present', () => {
    render(
      <CompanyBriefSection
        jobId={1}
        companyBrief="Acme is a fintech company..."
        companyBriefSources={['https://acme.example/about']}
      />
    );
    expect(screen.getByLabelText('Company Brief')).toHaveValue('Acme is a fintech company...');
    expect(screen.getByRole('link', { name: 'https://acme.example/about' })).toHaveAttribute(
      'href',
      'https://acme.example/about'
    );
  });

  it('renders no citation list when there are no sources', () => {
    render(<CompanyBriefSection jobId={1} companyBrief="Some brief" companyBriefSources={null} />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('PATCHes the edited brief text after the debounce delay', () => {
    render(<CompanyBriefSection jobId={1} companyBrief="" companyBriefSources={null} />);
    fireEvent.change(screen.getByLabelText('Company Brief'), { target: { value: 'Edited brief' } });
    vi.advanceTimersByTime(800);
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/jobs/1/kit',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ field: 'company_brief', value: 'Edited brief' }),
      })
    );
  });
});
