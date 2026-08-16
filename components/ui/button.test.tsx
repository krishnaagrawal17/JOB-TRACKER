import { render, screen } from '@testing-library/react';
import { Button } from '@/components/ui/button';

describe('shadcn Button', () => {
  it('renders its children', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole('button', { name: 'Click me' })).toBeInTheDocument();
  });

  // The brand lavender (`accent`) is for CTAs, focus rings, and brand marks only —
  // never a fill. Secondary buttons must hover to the subtle surface token instead.
  it.each(['outline', 'ghost'] as const)('hovers %s buttons to accent-subtle, not the brand lavender', (variant) => {
    render(<Button variant={variant}>Cancel</Button>);
    const classes = screen.getByRole('button', { name: 'Cancel' }).className.split(/\s+/);
    expect(classes).toContain('hover:bg-accent-subtle');
    expect(classes).not.toContain('hover:bg-accent');
  });
});
