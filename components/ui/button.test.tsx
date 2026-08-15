import { render, screen } from '@testing-library/react';
import { Button } from '@/components/ui/button';

describe('shadcn Button', () => {
  it('renders its children', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole('button', { name: 'Click me' })).toBeInTheDocument();
  });
});
