import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const pushMock = vi.fn();
vi.mock('next/navigation', () => ({
  useParams: () => ({ id: '1' }),
  useRouter: () => ({ push: pushMock }),
}));

vi.mock('@/components/job-detail/JobHeader', () => ({
  default: ({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) => (
    <div>
      <span>mock-job-header</span>
      <button onClick={onEdit}>trigger-edit</button>
      <button onClick={onDelete}>trigger-delete</button>
    </div>
  ),
}));
vi.mock('@/components/job-detail/JobDescription', () => ({ default: () => <div>mock-job-description</div> }));
vi.mock('@/components/job-detail/KitPanel', () => ({ default: () => <div>mock-kit-panel</div> }));
vi.mock('@/components/board/ExtractedJobForm', () => ({
  default: ({ onSubmit }: { onSubmit: () => void }) => (
    <div>
      <span>mock-extracted-job-form</span>
      <button onClick={onSubmit}>trigger-save</button>
    </div>
  ),
}));

import JobDetailPage from './page';

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  pushMock.mockClear();
  vi.restoreAllMocks();
});

const jobResponse = {
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
    rawInput: null,
    extraFields: null,
    createdAt: '2026-08-15T00:00:00.000Z',
    updatedAt: '2026-08-15T00:00:00.000Z',
  },
  kit: null,
};

describe('JobDetailPage', () => {
  it('fetches and renders the job header, description, and kit panel', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => jobResponse }) as unknown as typeof fetch;

    render(<JobDetailPage />);

    await waitFor(() => expect(screen.getByText('mock-job-header')).toBeInTheDocument());
    expect(screen.getByText('mock-job-description')).toBeInTheDocument();
    expect(screen.getByText('mock-kit-panel')).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledWith('/api/jobs/1');
  });

  it('switches to the edit form when onEdit fires, and back to the description on save', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => jobResponse }) as unknown as typeof fetch;

    render(<JobDetailPage />);
    await waitFor(() => expect(screen.getByText('mock-job-header')).toBeInTheDocument());

    fireEvent.click(screen.getByText('trigger-edit'));
    expect(screen.getByText('mock-extracted-job-form')).toBeInTheDocument();

    fireEvent.click(screen.getByText('trigger-save'));
    await waitFor(() => expect(screen.getByText('mock-job-description')).toBeInTheDocument());
  });

  it('deletes the job and redirects to the board on delete', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => jobResponse }) as unknown as typeof fetch;

    render(<JobDetailPage />);
    await waitFor(() => expect(screen.getByText('mock-job-header')).toBeInTheDocument());

    fireEvent.click(screen.getByText('trigger-delete'));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/jobs/1', { method: 'DELETE' });
    });
    expect(pushMock).toHaveBeenCalledWith('/');
  });
});
