import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RegisterForm from './RegisterForm';

const replace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
}));

beforeEach(() => {
  replace.mockClear();
  global.fetch = vi.fn();
});

async function fillAndSubmit(email: string, password: string, confirm: string) {
  await userEvent.type(screen.getByLabelText(/^email$/i), email);
  await userEvent.type(screen.getByLabelText(/^password/i), password);
  await userEvent.type(screen.getByLabelText(/confirm password/i), confirm);
  await userEvent.click(screen.getByRole('button', { name: /create account/i }));
}

describe('RegisterForm', () => {
  it('renders email, password, confirm-password fields and a submit button', () => {
    render(<RegisterForm />);
    expect(screen.getByLabelText(/^email$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^password/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/confirm password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create account/i })).toBeInTheDocument();
  });

  it('redirects to / on successful registration', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, status: 201 });
    render(<RegisterForm />);
    await fillAndSubmit('user@example.com', 'a-good-password', 'a-good-password');
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/'));
  });

  it('rejects mismatched passwords without calling the server', async () => {
    render(<RegisterForm />);
    await fillAndSubmit('user@example.com', 'a-good-password', 'does-not-match');
    expect(await screen.findByText('Passwords do not match.')).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('rejects a password shorter than 8 characters without calling the server', async () => {
    render(<RegisterForm />);
    await fillAndSubmit('user@example.com', 'short1', 'short1');
    expect(await screen.findByText('Password must be at least 8 characters.')).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('shows the server error message on failure', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ error: 'An account with that email already exists.' }),
    });
    render(<RegisterForm />);
    await fillAndSubmit('user@example.com', 'a-good-password', 'a-good-password');
    expect(await screen.findByText('An account with that email already exists.')).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it('does not submit twice while a request is in flight', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(() => new Promise(() => {}));
    render(<RegisterForm />);
    const button = screen.getByRole('button', { name: /create account/i });
    await fillAndSubmit('user@example.com', 'a-good-password', 'a-good-password');
    expect(button).toBeDisabled();
    await userEvent.click(button);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
