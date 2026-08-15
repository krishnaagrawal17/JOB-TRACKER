import { render, screen, fireEvent } from '@testing-library/react';
import JobCard from './JobCard';
import type { Job } from '@/lib/types';

const job: Job = {
  id: 1,
  stage: 'wishlist',
  position: 0,
  title: 'Senior Backend Engineer',
  company: 'Acme Corp',
  location: 'Remote',
  salary: '$160k-$190k',
  description: 'Build things.',
  sourceUrl: null,
  rawInput: null,
  extraFields: null,
  createdAt: '2026-08-15T00:00:00.000Z',
  updatedAt: '2026-08-15T00:00:00.000Z',
};

describe('JobCard', () => {
  it('renders the title, company, location, and salary', () => {
    render(<JobCard job={job} />);
    expect(screen.getByText('Senior Backend Engineer')).toBeInTheDocument();
    expect(screen.getByText('Acme Corp')).toBeInTheDocument();
    expect(screen.getByText('Remote')).toBeInTheDocument();
    expect(screen.getByText('$160k-$190k')).toBeInTheDocument();
  });

  it('calls onClick when clicked', () => {
    const onClick = vi.fn();
    render(<JobCard job={job} onClick={onClick} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalled();
  });

  it('falls back to "Untitled role" when title is null', () => {
    render(<JobCard job={{ ...job, title: null }} />);
    expect(screen.getByText('Untitled role')).toBeInTheDocument();
  });
});
