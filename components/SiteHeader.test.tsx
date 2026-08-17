import { render, screen } from '@testing-library/react';
import SiteHeader from './SiteHeader';

const pathname = vi.fn();
vi.mock('next/navigation', () => ({ usePathname: () => pathname() }));

describe('SiteHeader', () => {
  it('renders nothing on the login page', () => {
    pathname.mockReturnValue('/login');
    const { container } = render(<SiteHeader />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders navigation and a logout control elsewhere', () => {
    pathname.mockReturnValue('/');
    render(<SiteHeader />);
    expect(screen.getByRole('link', { name: 'Board' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Profile' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /log out/i })).toBeInTheDocument();
  });
});
