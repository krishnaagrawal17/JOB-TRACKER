import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LoginForm from './LoginForm';

const replace = vi.fn();
let search = 'next=/profile';
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => new URLSearchParams(search),
}));

beforeEach(() => {
  replace.mockClear();
  search = 'next=/profile';
  global.fetch = vi.fn();
});

async function submit(password: string) {
  await userEvent.type(screen.getByLabelText(/password/i), password);
  await userEvent.click(screen.getByRole('button', { name: /log in/i }));
}

describe('LoginForm', () => {
  it('renders a password field and submit button', () => {
    render(<LoginForm />);
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /log in/i })).toBeInTheDocument();
  });

  it('redirects to the requested path on success', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, status: 200 });
    render(<LoginForm />);
    await submit('secret');
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/profile'));
  });

  // Spec verification item 14: open-redirect defence.
  it.each([
    'next=https://evil.com',
    'next=//evil.com',
    'next=/\\evil.com',
    'next=http://evil.com/path',
    '',
    // Control-character bypass: WHATWG URL parsing strips these before resolving, so a
    // value that looks like a same-origin relative path here can still resolve externally.
    'next=/\t/evil.com',
    'next=/\n/evil.com',
    'next=/\r/evil.com',
  ])('falls back to / for hostile or missing next (%j)', async (query) => {
    search = query;
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, status: 200 });
    render(<LoginForm />);
    await submit('secret');
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/'));
  });

  it('shows the server error message on failure', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: 'Incorrect password.' }),
    });
    render(<LoginForm />);
    await submit('bad');
    expect(await screen.findByText('Incorrect password.')).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it('does not submit twice while a request is in flight', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(
      () => new Promise(() => {}),
    );
    render(<LoginForm />);
    const button = screen.getByRole('button', { name: /log in/i });
    await submit('secret');
    expect(button).toBeDisabled();
    await userEvent.click(button);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
