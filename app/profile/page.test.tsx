import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('@/components/profile/ProfileForm', () => ({
  default: ({
    value,
    onChange,
    onSave,
    isSaving,
  }: {
    value: { resumeText: string; aboutMe: string };
    onChange: (v: { resumeText: string; aboutMe: string }) => void;
    onSave: () => void;
    isSaving: boolean;
  }) => (
    <div>
      <span>mock-profile-form</span>
      <span>resume:{value.resumeText}</span>
      <span>saving:{String(isSaving)}</span>
      <button onClick={() => onChange({ resumeText: 'Edited', aboutMe: value.aboutMe })}>trigger-change</button>
      <button onClick={onSave}>trigger-save</button>
    </div>
  ),
}));

import ProfilePage from './page';

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('ProfilePage', () => {
  it('fetches and passes the stored profile into ProfileForm', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ profile: { resumeText: 'Stored resume', aboutMe: 'Stored about' } }),
    }) as unknown as typeof fetch;

    render(<ProfilePage />);

    await waitFor(() => {
      expect(screen.getByText('resume:Stored resume')).toBeInTheDocument();
    });
  });

  it('renders empty values when no profile exists yet', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ profile: null }),
    }) as unknown as typeof fetch;

    render(<ProfilePage />);

    await waitFor(() => {
      expect(screen.getByText('resume:')).toBeInTheDocument();
    });
  });

  it('PATCHes the profile when Save is triggered', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ profile: { resumeText: '', aboutMe: '' } }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<ProfilePage />);
    await waitFor(() => expect(screen.getByText('mock-profile-form')).toBeInTheDocument());

    fireEvent.click(screen.getByText('trigger-save'));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/profile', expect.objectContaining({ method: 'PATCH' }));
    });
  });

  it('shows the server error message when the save request comes back non-ok', async () => {
    const fetchMock = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
      if (init?.method === 'PATCH') {
        return Promise.resolve({ ok: false, json: async () => ({ error: 'aboutMe must be a string or null.' }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({ profile: null }) });
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<ProfilePage />);
    await waitFor(() => expect(screen.getByText('mock-profile-form')).toBeInTheDocument());

    fireEvent.click(screen.getByText('trigger-save'));

    await waitFor(() => {
      expect(screen.getByText('aboutMe must be a string or null.')).toBeInTheDocument();
    });
  });

  it('shows a network-failure message when the save request rejects', async () => {
    const fetchMock = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
      if (init?.method === 'PATCH') {
        return Promise.reject(new Error('network down'));
      }
      return Promise.resolve({ ok: true, json: async () => ({ profile: null }) });
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<ProfilePage />);
    await waitFor(() => expect(screen.getByText('mock-profile-form')).toBeInTheDocument());

    fireEvent.click(screen.getByText('trigger-save'));

    await waitFor(() => {
      expect(screen.getByText(/could not reach the server/i)).toBeInTheDocument();
    });
  });

  it('prevents a double-save: triggering save while a request is in flight fires only one PATCH', async () => {
    let resolvePatch: (value: unknown) => void = () => {};
    const fetchMock = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
      if (init?.method === 'PATCH') {
        return new Promise((resolve) => {
          resolvePatch = resolve;
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({ profile: null }) });
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<ProfilePage />);
    await waitFor(() => expect(screen.getByText('mock-profile-form')).toBeInTheDocument());

    fireEvent.click(screen.getByText('trigger-save'));
    await waitFor(() => expect(screen.getByText('saving:true')).toBeInTheDocument());

    fireEvent.click(screen.getByText('trigger-save'));

    const patchCalls = fetchMock.mock.calls.filter(([, init]) => init?.method === 'PATCH');
    expect(patchCalls).toHaveLength(1);

    resolvePatch({ ok: true, json: async () => ({ profile: { resumeText: '', aboutMe: '' } }) });
    await waitFor(() => expect(screen.getByText('saving:false')).toBeInTheDocument());
  });

  it('shows the server error message, and withholds the form, when the initial load comes back non-ok', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'boom' }),
    }) as unknown as typeof fetch;

    render(<ProfilePage />);

    await waitFor(() => {
      expect(screen.getByText('boom')).toBeInTheDocument();
    });
    expect(screen.queryByText('mock-profile-form')).not.toBeInTheDocument();
  });

  it('shows a network-failure message, and withholds the form, when the initial load rejects', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('network down')) as unknown as typeof fetch;

    render(<ProfilePage />);

    await waitFor(() => {
      expect(screen.getByText(/could not reach the server/i)).toBeInTheDocument();
    });
    expect(screen.queryByText('mock-profile-form')).not.toBeInTheDocument();
  });

  it('lets the user retry a failed load, and shows the form with the loaded data once the retry succeeds', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'boom' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ profile: { resumeText: 'Stored', aboutMe: '' } }) });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<ProfilePage />);
    await waitFor(() => expect(screen.getByText('boom')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    await waitFor(() => expect(screen.getByText('resume:Stored')).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('keeps the values the user has in the form after a successful save, instead of reverting them to the server echo', async () => {
    const fetchMock = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
      if (init?.method === 'PATCH') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ profile: { resumeText: 'Server echo, should be ignored', aboutMe: '' } }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({ profile: null }) });
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<ProfilePage />);
    await waitFor(() => expect(screen.getByText('mock-profile-form')).toBeInTheDocument());

    fireEvent.click(screen.getByText('trigger-change'));
    await waitFor(() => expect(screen.getByText('resume:Edited')).toBeInTheDocument());

    fireEvent.click(screen.getByText('trigger-save'));

    await waitFor(() => expect(screen.getByText('saving:false')).toBeInTheDocument());
    expect(screen.getByText('resume:Edited')).toBeInTheDocument();
  });

  it('PATCHes the edited values, not the originally loaded ones, when the user edits before saving', async () => {
    const fetchMock = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
      if (init?.method === 'PATCH') {
        return Promise.resolve({ ok: true, json: async () => ({ profile: { resumeText: 'Edited', aboutMe: '' } }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({ profile: null }) });
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<ProfilePage />);
    await waitFor(() => expect(screen.getByText('mock-profile-form')).toBeInTheDocument());

    fireEvent.click(screen.getByText('trigger-change'));
    fireEvent.click(screen.getByText('trigger-save'));

    await waitFor(() => {
      const patchCall = fetchMock.mock.calls.find(([, init]) => init?.method === 'PATCH');
      expect(patchCall).toBeDefined();
      const body = JSON.parse((patchCall as [string, RequestInit])[1].body as string);
      expect(body).toEqual({ resumeText: 'Edited', aboutMe: '' });
    });
  });
});
