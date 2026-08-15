import { render, screen, fireEvent } from '@testing-library/react';
import Column from './Column';
import type { Job } from '@/lib/types';

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

describe('Column', () => {
  it('renders the stage label and job count', () => {
    render(<Column stage="applied" jobs={[makeJob({ id: 1 }), makeJob({ id: 2 })]} onJobClick={() => {}} />);
    expect(screen.getByText('Applied')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('renders zero for an empty column', () => {
    render(<Column stage="offer" jobs={[]} onJobClick={() => {}} />);
    expect(screen.getByText('Offer')).toBeInTheDocument();
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it('renders a JobCard per job and forwards clicks with the right job', () => {
    const onJobClick = vi.fn();
    const jobA = makeJob({ id: 1, title: 'Job A' });
    const jobB = makeJob({ id: 2, title: 'Job B' });
    render(<Column stage="wishlist" jobs={[jobA, jobB]} onJobClick={onJobClick} />);

    fireEvent.click(screen.getByText('Job B'));
    expect(onJobClick).toHaveBeenCalledWith(jobB);
  });
});

describe('Column renderJob override', () => {
  it('uses renderJob instead of the default JobCard when provided', () => {
    const job = makeJob({ id: 1, title: 'Custom Rendered Job' });
    render(
      <Column
        stage="wishlist"
        jobs={[job]}
        onJobClick={() => {}}
        renderJob={(j) => <div>Custom wrapper for {j.title}</div>}
      />
    );
    expect(screen.getByText('Custom wrapper for Custom Rendered Job')).toBeInTheDocument();
  });
});
