import { render, screen, fireEvent } from '@testing-library/react';
import JobHeader from './JobHeader';
import type { Job } from '@/lib/types';

const job: Job = {
  id: 1,
  stage: 'applied',
  position: 0,
  title: 'Senior Backend Engineer',
  company: 'Acme Corp',
  location: 'Remote',
  salary: '$160k-$190k',
  description: null,
  sourceUrl: null,
  rawInput: null,
  extraFields: null,
  createdAt: '2026-08-15T00:00:00.000Z',
  updatedAt: '2026-08-15T00:00:00.000Z',
};

describe('JobHeader', () => {
  it('renders the title, company, location, salary, and stage badge', () => {
    render(<JobHeader job={job} onEdit={() => {}} onDelete={() => {}} />);
    expect(screen.getByText('Senior Backend Engineer')).toBeInTheDocument();
    expect(screen.getByText(/Acme Corp/)).toBeInTheDocument();
    expect(screen.getByText('$160k-$190k')).toBeInTheDocument();
    expect(screen.getByText('Applied')).toBeInTheDocument();
  });

  it('renders the stage badge as a surface-2 pill, not a lavender fill', () => {
    render(<JobHeader job={job} onEdit={() => {}} onDelete={() => {}} />);
    const classes = screen.getByText('Applied').className.split(/\s+/);
    expect(classes).toContain('bg-surface-2');
    expect(classes).toContain('text-ink-muted');
    expect(classes).toContain('rounded-full');
    expect(classes).not.toContain('bg-primary');
  });

  it('calls onEdit when the Edit button is clicked', () => {
    const onEdit = vi.fn();
    render(<JobHeader job={job} onEdit={onEdit} onDelete={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(onEdit).toHaveBeenCalled();
  });

  it('shows a confirm dialog before calling onDelete, and only deletes on confirm', () => {
    const onDelete = vi.fn();
    render(<JobHeader job={job} onEdit={() => {}} onDelete={onDelete} />);

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(screen.getByText('Delete this job?')).toBeInTheDocument();
    expect(onDelete).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Yes, delete' }));
    expect(onDelete).toHaveBeenCalled();
  });
});
