import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@/components/board/Board', () => ({
  default: ({ onJobClick }: { onJobClick: (job: { id: number }) => void }) => (
    <div>
      <span>mock-board</span>
      <button onClick={() => onJobClick({ id: 42 })}>trigger-job-click</button>
    </div>
  ),
}));

const pushMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}));

vi.mock('@/components/board/AddJobDialog', () => ({
  default: ({ open, onJobCreated }: { open: boolean; onJobCreated: (job: unknown) => void }) => (
    <div>
      <span>add-job-dialog-open:{String(open)}</span>
      <button onClick={() => onJobCreated({ id: 1 })}>trigger-job-created</button>
    </div>
  ),
}));

import Home from './page';

afterEach(() => {
  pushMock.mockClear();
  vi.restoreAllMocks();
});

describe('Home', () => {
  it('renders the app name and the board', () => {
    render(<Home />);
    expect(screen.getByText('Job Tracker')).toBeInTheDocument();
    expect(screen.getByText('mock-board')).toBeInTheDocument();
  });

  it('opens the Add Job dialog when the Add Job button is clicked', () => {
    render(<Home />);
    expect(screen.getByText('add-job-dialog-open:false')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add Job' }));
    expect(screen.getByText('add-job-dialog-open:true')).toBeInTheDocument();
  });

  it('navigates to the job detail page when a card is clicked', () => {
    render(<Home />);
    fireEvent.click(screen.getByText('trigger-job-click'));
    expect(pushMock).toHaveBeenCalledWith('/jobs/42');
  });
});
