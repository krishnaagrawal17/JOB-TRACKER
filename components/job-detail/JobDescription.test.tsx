import { render, screen } from '@testing-library/react';
import JobDescription from './JobDescription';
import type { Job } from '@/lib/types';

const baseJob: Job = {
  id: 1,
  stage: 'wishlist',
  position: 0,
  title: 'Engineer',
  company: 'Acme',
  location: null,
  salary: null,
  description: 'Build reliable backend services.',
  sourceUrl: null,
  rawInput: null,
  extraFields: null,
  createdAt: '2026-08-15T00:00:00.000Z',
  updatedAt: '2026-08-15T00:00:00.000Z',
};

describe('JobDescription', () => {
  it('renders the job description', () => {
    render(<JobDescription job={baseJob} />);
    expect(screen.getByText('Build reliable backend services.')).toBeInTheDocument();
  });

  it('shows a fallback when there is no description', () => {
    render(<JobDescription job={{ ...baseJob, description: null }} />);
    expect(screen.getByText('No description.')).toBeInTheDocument();
  });
});
