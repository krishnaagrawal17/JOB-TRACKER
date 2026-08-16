import { act, render, screen, fireEvent, waitFor, within } from '@testing-library/react';
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

/** The column heading's own container — used to assert which column a card ended up in. */
function columnFor(label: string): HTMLElement {
  const heading = screen.getByRole('heading', { name: label });
  const column = heading.closest('.w-72');
  if (!column) throw new Error(`Could not find the column container for "${label}"`);
  return column as HTMLElement;
}

describe('Board drag positioning', () => {
  // Wishlist holds A(0), B(1), C(2); Applied holds D(0), E(1).
  const boardJobs = [
    makeJob({ id: 1, stage: 'wishlist', position: 0, title: 'Job A' }),
    makeJob({ id: 2, stage: 'wishlist', position: 1, title: 'Job B' }),
    makeJob({ id: 3, stage: 'wishlist', position: 2, title: 'Job C' }),
    makeJob({ id: 4, stage: 'applied', position: 0, title: 'Job D' }),
    makeJob({ id: 5, stage: 'applied', position: 1, title: 'Job E' }),
  ];

  function mockBoardFetch() {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/jobs') {
        return Promise.resolve({ ok: true, json: async () => ({ jobs: boardJobs }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({ job: boardJobs[0] }) });
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    return fetchMock;
  }

  function patchBodies(fetchMock: ReturnType<typeof vi.fn>): unknown[] {
    return fetchMock.mock.calls
      .filter(([url, init]) => url !== '/api/jobs' && init?.method === 'PATCH')
      .map(([, init]) => JSON.parse(init.body as string));
  }

  async function renderBoard(fetchMock: ReturnType<typeof vi.fn>) {
    render(<Board onJobClick={() => {}} />);
    await waitFor(() => expect(screen.getByText('Job A')).toBeInTheDocument());
    fetchMock.mockClear();
  }

  it('PATCHes position 1 when a card is dragged down by exactly one slot', async () => {
    // A(0) dropped on B(1). dnd-kit previews [B, A, C], so the server must be told
    // position 1 — the pre-fix code computed 0 and silently no-opped.
    const fetchMock = mockBoardFetch();
    await renderBoard(fetchMock);

    await act(async () => {
      capturedOnDragEnd?.({ active: { id: 1 }, over: { id: 2 } });
    });

    await waitFor(() => expect(patchBodies(fetchMock)).toHaveLength(1));
    expect(patchBodies(fetchMock)[0]).toEqual({ stage: 'wishlist', position: 1 });
  });

  it('PATCHes position 2 when a card is dragged down by more than one slot', async () => {
    // A(0) dropped on C(2). dnd-kit previews [B, C, A] — the bottom slot, position 2.
    const fetchMock = mockBoardFetch();
    await renderBoard(fetchMock);

    await act(async () => {
      capturedOnDragEnd?.({ active: { id: 1 }, over: { id: 3 } });
    });

    await waitFor(() => expect(patchBodies(fetchMock)).toHaveLength(1));
    expect(patchBodies(fetchMock)[0]).toEqual({ stage: 'wishlist', position: 2 });
  });

  it('PATCHes position 0 when a card is dragged upward within its column', async () => {
    // C(2) dropped on A(0). dnd-kit previews [C, A, B].
    const fetchMock = mockBoardFetch();
    await renderBoard(fetchMock);

    await act(async () => {
      capturedOnDragEnd?.({ active: { id: 3 }, over: { id: 1 } });
    });

    await waitFor(() => expect(patchBodies(fetchMock)).toHaveLength(1));
    expect(patchBodies(fetchMock)[0]).toEqual({ stage: 'wishlist', position: 0 });
  });

  it('PATCHes position 1 when a card is dragged upward by one slot within its column', async () => {
    // C(2) dropped on B(1) — the mirror image of the down-by-one case.
    const fetchMock = mockBoardFetch();
    await renderBoard(fetchMock);

    await act(async () => {
      capturedOnDragEnd?.({ active: { id: 3 }, over: { id: 2 } });
    });

    await waitFor(() => expect(patchBodies(fetchMock)).toHaveLength(1));
    expect(patchBodies(fetchMock)[0]).toEqual({ stage: 'wishlist', position: 1 });
  });

  it('PATCHes the target stage and the over-card slot when dropped onto a sibling in another column', async () => {
    // A(wishlist) dropped on E(applied, 1): no downward shift applies across stages.
    const fetchMock = mockBoardFetch();
    await renderBoard(fetchMock);

    await act(async () => {
      capturedOnDragEnd?.({ active: { id: 1 }, over: { id: 5 } });
    });

    await waitFor(() => expect(patchBodies(fetchMock)).toHaveLength(1));
    expect(patchBodies(fetchMock)[0]).toEqual({ stage: 'applied', position: 1 });
  });

  it('does nothing when a card is dropped back onto itself', async () => {
    const fetchMock = mockBoardFetch();
    await renderBoard(fetchMock);

    await act(async () => {
      capturedOnDragEnd?.({ active: { id: 1 }, over: { id: 1 } });
    });

    await waitFor(() => expect(screen.getByText('Job A')).toBeInTheDocument());
    expect(patchBodies(fetchMock)).toHaveLength(0);
  });
});

describe('Board load failures', () => {
  it('shows an error with Retry when the initial load fails, and recovers on retry', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'Database is unavailable.' }) })
      .mockResolvedValue({ ok: true, json: async () => ({ jobs: [makeJob({ id: 1, title: 'Job A' })] }) });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<Board onJobClick={() => {}} />);

    await waitFor(() => expect(screen.getByText('Database is unavailable.')).toBeInTheDocument());
    // The empty board must not be rendered behind the error.
    expect(screen.queryByRole('heading', { name: 'Wishlist' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    await waitFor(() => expect(screen.getByText('Job A')).toBeInTheDocument());
    expect(screen.queryByText('Database is unavailable.')).not.toBeInTheDocument();
  });

  it('shows an error with Retry when the initial load rejects at the network level', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<Board onJobClick={() => {}} />);

    await waitFor(() =>
      expect(screen.getByText('Could not reach the server. Check your connection and try again.')).toBeInTheDocument()
    );
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('keeps a committed move when the follow-up refetch fails', async () => {
    let jobsCall = 0;
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/api/jobs') {
        jobsCall += 1;
        // First load succeeds; the post-PATCH reconciliation refetch fails.
        if (jobsCall === 1) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ jobs: [makeJob({ id: 1, stage: 'wishlist', position: 0, title: 'Job A' })] }),
          });
        }
        return Promise.reject(new TypeError('Failed to fetch'));
      }
      expect(init?.method).toBe('PATCH');
      return Promise.resolve({ ok: true, json: async () => ({ job: makeJob({ id: 1, stage: 'applied' }) }) });
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<Board onJobClick={() => {}} />);
    await waitFor(() => expect(screen.getByText('Job A')).toBeInTheDocument());

    await act(async () => {
      capturedOnDragEnd?.({ active: { id: 1 }, over: { id: 'applied' } });
    });

    await waitFor(() => expect(jobsCall).toBe(2));
    // The move stays where the server committed it, and no error screen replaces the board.
    expect(within(columnFor('Applied')).getByText('Job A')).toBeInTheDocument();
    expect(within(columnFor('Wishlist')).queryByText('Job A')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
  });
});
