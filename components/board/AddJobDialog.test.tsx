import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AddJobDialog from './AddJobDialog';

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('AddJobDialog', () => {
  it('extracts from a pasted URL and shows the editable preview form', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        extracted: {
          title: 'Engineer',
          company: 'Acme',
          location: 'Remote',
          salary: null,
          description: 'Do stuff.',
          sourceUrl: null,
          extraFields: {},
        },
        rawText: 'raw posting text',
      }),
    }) as unknown as typeof fetch;

    render(<AddJobDialog open={true} onOpenChange={() => {}} onJobCreated={() => {}} />);

    fireEvent.change(screen.getByLabelText('Job posting URL'), { target: { value: 'https://acme.example/jobs/1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Extract' }));

    await waitFor(() => expect(screen.getByLabelText('Title')).toHaveValue('Engineer'));
    expect(screen.getByLabelText('Company')).toHaveValue('Acme');
  });

  it('switches to the paste-text tab and shows a message when the url fetch is blocked', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({
        error: 'Could not fetch this URL — paste the job description text instead.',
        blocked: true,
      }),
    }) as unknown as typeof fetch;

    render(<AddJobDialog open={true} onOpenChange={() => {}} onJobCreated={() => {}} />);

    fireEvent.change(screen.getByLabelText('Job posting URL'), { target: { value: 'https://linkedin.example/jobs/1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Extract' }));

    await waitFor(() => {
      expect(screen.getByText(/paste the job description text instead/)).toBeInTheDocument();
    });
    expect(screen.getByLabelText('Job posting text')).toBeInTheDocument();
  });

  it('confirms the preview form and calls onJobCreated with the created job', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/jobs/extract') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            extracted: {
              title: 'Engineer',
              company: 'Acme',
              location: null,
              salary: null,
              description: null,
              sourceUrl: null,
              extraFields: {},
            },
            rawText: 'raw text',
          }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({
          job: {
            id: 1,
            stage: 'wishlist',
            position: 0,
            title: 'Engineer',
            company: 'Acme',
            location: null,
            salary: null,
            description: null,
            sourceUrl: null,
            rawInput: 'raw text',
            extraFields: null,
            createdAt: '2026-08-15T00:00:00.000Z',
            updatedAt: '2026-08-15T00:00:00.000Z',
          },
        }),
      });
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const onJobCreated = vi.fn();
    render(<AddJobDialog open={true} onOpenChange={() => {}} onJobCreated={onJobCreated} />);

    fireEvent.change(screen.getByLabelText('Job posting URL'), { target: { value: 'https://acme.example/jobs/1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Extract' }));

    await waitFor(() => expect(screen.getByLabelText('Title')).toHaveValue('Engineer'));

    fireEvent.click(screen.getByRole('button', { name: 'Add Job' }));

    await waitFor(() => {
      expect(onJobCreated).toHaveBeenCalledWith(expect.objectContaining({ id: 1, title: 'Engineer' }));
    });
    expect(fetchMock).toHaveBeenCalledWith('/api/jobs', expect.objectContaining({ method: 'POST' }));
  });

  it('shows an error message when the extract request itself fails (network error)', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Failed to fetch')) as unknown as typeof fetch;

    render(<AddJobDialog open={true} onOpenChange={() => {}} onJobCreated={() => {}} />);

    fireEvent.change(screen.getByLabelText('Job posting URL'), { target: { value: 'https://acme.example/jobs/1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Extract' }));

    await waitFor(() => {
      expect(screen.getByText(/could not reach the server/i)).toBeInTheDocument();
    });
    // Still on the input step — no crash, no silent no-op.
    expect(screen.getByLabelText('Job posting URL')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Extract' })).not.toBeDisabled();
  });

  it('shows an error message when the confirm request itself fails (network error)', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/jobs/extract') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            extracted: {
              title: 'Engineer',
              company: 'Acme',
              location: null,
              salary: null,
              description: null,
              sourceUrl: null,
              extraFields: {},
            },
            rawText: 'raw text',
          }),
        });
      }
      return Promise.reject(new Error('Failed to fetch'));
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const onJobCreated = vi.fn();
    render(<AddJobDialog open={true} onOpenChange={() => {}} onJobCreated={onJobCreated} />);

    fireEvent.change(screen.getByLabelText('Job posting URL'), { target: { value: 'https://acme.example/jobs/1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Extract' }));

    await waitFor(() => expect(screen.getByLabelText('Title')).toHaveValue('Engineer'));

    fireEvent.click(screen.getByRole('button', { name: 'Add Job' }));

    await waitFor(() => {
      expect(screen.getByText(/could not reach the server/i)).toBeInTheDocument();
    });
    expect(onJobCreated).not.toHaveBeenCalled();
  });

  it('prevents a double-submit: a second click on Add Job while the first request is in flight fires only one POST /api/jobs', async () => {
    let resolveCreate: (value: unknown) => void = () => {};
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/jobs/extract') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            extracted: {
              title: 'Engineer',
              company: 'Acme',
              location: null,
              salary: null,
              description: null,
              sourceUrl: null,
              extraFields: {},
            },
            rawText: 'raw text',
          }),
        });
      }
      return new Promise((resolve) => {
        resolveCreate = resolve;
      });
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const onJobCreated = vi.fn();
    render(<AddJobDialog open={true} onOpenChange={() => {}} onJobCreated={onJobCreated} />);

    fireEvent.change(screen.getByLabelText('Job posting URL'), { target: { value: 'https://acme.example/jobs/1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Extract' }));

    await waitFor(() => expect(screen.getByLabelText('Title')).toHaveValue('Engineer'));

    const submitButton = screen.getByRole('button', { name: 'Add Job' });
    fireEvent.click(submitButton);

    await waitFor(() => expect(submitButton).toBeDisabled());

    // Second click while the first request is still pending should be a no-op.
    fireEvent.click(submitButton);

    const createCalls = fetchMock.mock.calls.filter(([url]) => url === '/api/jobs');
    expect(createCalls).toHaveLength(1);

    resolveCreate({
      ok: true,
      json: async () => ({
        job: {
          id: 1,
          stage: 'wishlist',
          position: 0,
          title: 'Engineer',
          company: 'Acme',
          location: null,
          salary: null,
          description: null,
          sourceUrl: null,
          rawInput: 'raw text',
          extraFields: null,
          createdAt: '2026-08-15T00:00:00.000Z',
          updatedAt: '2026-08-15T00:00:00.000Z',
        },
      }),
    });

    await waitFor(() => expect(onJobCreated).toHaveBeenCalledTimes(1));
  });
});
