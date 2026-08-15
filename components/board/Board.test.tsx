import { render, screen, waitFor } from '@testing-library/react';
import Board, { moveJobOptimistically } from './Board';
import type { Job } from '@/lib/types';

let capturedOnDragEnd: ((event: { active: { id: number }; over: { id: string | number } | null }) => void) | undefined;

vi.mock('@dnd-kit/core', async () => {
  const actual = await vi.importActual<typeof import('@dnd-kit/core')>('@dnd-kit/core');
  return {
    ...actual,
    DndContext: ({ children, onDragEnd }: { children: React.ReactNode; onDragEnd: typeof capturedOnDragEnd }) => {
      capturedOnDragEnd = onDragEnd;
      return <div>{children}</div>;
    },
    useDroppable: () => ({ setNodeRef: () => {} }),
  };
});

vi.mock('@dnd-kit/sortable', async () => {
  const actual = await vi.importActual<typeof import('@dnd-kit/sortable')>('@dnd-kit/sortable');
  return {
    ...actual,
    useSortable: () => ({
      attributes: {},
      listeners: {},
      setNodeRef: () => {},
      transform: null,
      transition: undefined,
      isDragging: false,
    }),
    SortableContext: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  };
});

function makeJob(overrides: Partial<Job>): Job {
  return {
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
    ...overrides,
  };
}

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  capturedOnDragEnd = undefined;
  vi.restoreAllMocks();
});

describe('moveJobOptimistically', () => {
  it('moves a job into a new stage at the given position and renumbers the destination', () => {
    const jobs = [
      makeJob({ id: 1, stage: 'wishlist', position: 0 }),
      makeJob({ id: 2, stage: 'applied', position: 0 }),
    ];
    const result = moveJobOptimistically(jobs, 1, 'applied', 0);
    expect(result.find((j) => j.id === 1)).toMatchObject({ stage: 'applied', position: 0 });
    expect(result.find((j) => j.id === 2)).toMatchObject({ stage: 'applied', position: 1 });
  });

  it('returns the original array unchanged when the job id is not found', () => {
    const jobs = [makeJob({ id: 1 })];
    const result = moveJobOptimistically(jobs, 999, 'applied', 0);
    expect(result).toBe(jobs);
  });
});

describe('Board', () => {
  it('fetches jobs on mount and renders all 5 columns', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ jobs: [makeJob({ id: 1, stage: 'wishlist' })] }),
    }) as unknown as typeof fetch;

    render(<Board onJobClick={() => {}} />);

    await waitFor(() => expect(screen.getByText('Wishlist')).toBeInTheDocument());
    expect(screen.getByText('Applied')).toBeInTheDocument();
    expect(screen.getByText('Interviewing')).toBeInTheDocument();
    expect(screen.getByText('Offer')).toBeInTheDocument();
    expect(screen.getByText('Rejected')).toBeInTheDocument();
    expect(screen.getByText('Engineer')).toBeInTheDocument();
  });

  it('sends an optimistic PATCH when a drag-end event moves a card to a new column', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/jobs') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ jobs: [makeJob({ id: 1, stage: 'wishlist', position: 0 })] }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({ job: makeJob({ id: 1, stage: 'applied', position: 0 }) }) });
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<Board onJobClick={() => {}} />);
    await waitFor(() => expect(screen.getByText('Engineer')).toBeInTheDocument());

    capturedOnDragEnd?.({ active: { id: 1 }, over: { id: 'applied' } });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/jobs/1',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ stage: 'applied', position: 0 }),
        })
      );
    });
  });

  it('rolls back the optimistic move when the PATCH request fails', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/jobs') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ jobs: [makeJob({ id: 1, stage: 'wishlist', position: 0 })] }),
        });
      }
      return Promise.resolve({ ok: false, json: async () => ({ error: 'failed' }) });
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<Board onJobClick={() => {}} />);
    await waitFor(() => expect(screen.getByText('Engineer')).toBeInTheDocument());

    capturedOnDragEnd?.({ active: { id: 1 }, over: { id: 'applied' } });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/jobs/1', expect.objectContaining({ method: 'PATCH' }));
    });
    await waitFor(() => {
      expect(screen.getAllByText('Engineer')).toHaveLength(1);
    });
  });
});
