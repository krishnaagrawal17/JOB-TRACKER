import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ResumeUpload from './ResumeUpload';

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('ResumeUpload', () => {
  it('uploads the selected file and calls onExtracted with the extracted text', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ profile: { resumeText: 'Extracted resume text', resumeFilename: 'resume.pdf' } }),
    }) as unknown as typeof fetch;

    const onExtracted = vi.fn();
    render(<ResumeUpload onExtracted={onExtracted} />);

    const input = screen.getByLabelText('Upload resume') as HTMLInputElement;
    const file = new File(['fake pdf bytes'], 'resume.pdf', { type: 'application/pdf' });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(onExtracted).toHaveBeenCalledWith('Extracted resume text', 'resume.pdf');
    });
  });

  it('does nothing when no file is chosen', () => {
    global.fetch = vi.fn() as unknown as typeof fetch;
    render(<ResumeUpload onExtracted={vi.fn()} />);
    const input = screen.getByLabelText('Upload resume') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [] } });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('shows an error message when the upload fails', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Only PDF and DOCX resumes are supported.' }),
    }) as unknown as typeof fetch;

    render(<ResumeUpload onExtracted={vi.fn()} />);
    const input = screen.getByLabelText('Upload resume') as HTMLInputElement;
    const file = new File(['not a resume'], 'resume.txt', { type: 'text/plain' });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText('Only PDF and DOCX resumes are supported.')).toBeInTheDocument();
    });
  });

  it('shows a network-failure message when the fetch rejects', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('network down')) as unknown as typeof fetch;

    render(<ResumeUpload onExtracted={vi.fn()} />);
    const input = screen.getByLabelText('Upload resume') as HTMLInputElement;
    const file = new File(['fake pdf bytes'], 'resume.pdf', { type: 'application/pdf' });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText(/could not reach the server/i)).toBeInTheDocument();
    });
  });

  it('prevents a double-upload: selecting a file while an upload is in flight fires only one POST', async () => {
    let resolveUpload: (value: unknown) => void = () => {};
    const fetchMock = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveUpload = resolve;
        })
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<ResumeUpload onExtracted={vi.fn()} />);
    const input = screen.getByLabelText('Upload resume') as HTMLInputElement;
    const file = new File(['fake pdf bytes'], 'resume.pdf', { type: 'application/pdf' });

    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(screen.getByText('Uploading...')).toBeInTheDocument());

    // Second selection while the first upload is still in flight should be a no-op.
    fireEvent.change(input, { target: { files: [file] } });

    expect(fetchMock).toHaveBeenCalledTimes(1);

    resolveUpload({
      ok: true,
      json: async () => ({ profile: { resumeText: 'text', resumeFilename: 'resume.pdf' } }),
    });
    await waitFor(() => expect(screen.queryByText('Uploading...')).not.toBeInTheDocument());
  });

  it('disables the file input while an upload is in flight and resets its value so the same file can be re-selected', async () => {
    let resolveUpload: (value: unknown) => void = () => {};
    const fetchMock = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveUpload = resolve;
        })
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<ResumeUpload onExtracted={vi.fn()} />);
    const input = screen.getByLabelText('Upload resume') as HTMLInputElement;
    const file = new File(['fake pdf bytes'], 'resume.pdf', { type: 'application/pdf' });

    fireEvent.change(input, { target: { files: [file] } });

    // The input's value is cleared synchronously by the change handler, before
    // the upload even resolves, so picking the same file again later still fires
    // a change event instead of being a silent no-op.
    expect(input.value).toBe('');
    await waitFor(() => expect(input).toBeDisabled());

    resolveUpload({
      ok: true,
      json: async () => ({ profile: { resumeText: 'text', resumeFilename: 'resume.pdf' } }),
    });
    await waitFor(() => expect(input).not.toBeDisabled());
  });
});
