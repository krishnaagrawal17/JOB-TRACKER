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
});
