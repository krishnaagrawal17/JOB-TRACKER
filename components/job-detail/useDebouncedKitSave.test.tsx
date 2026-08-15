import { renderHook, act } from '@testing-library/react';
import { useDebouncedKitSave, linesToText, textToLines } from './useDebouncedKitSave';

const originalFetch = global.fetch;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}

describe('useDebouncedKitSave', () => {
  it('initializes value from externalValue with no save error', () => {
    const { result } = renderHook(() =>
      useDebouncedKitSave({ jobId: 1, field: 'cover_letter', externalValue: 'Hello', serialize: (t) => t })
    );
    expect(result.current.value).toBe('Hello');
    expect(result.current.saveError).toBeNull();
  });

  it('does not PATCH immediately on change; PATCHes after the debounce delay', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true }) as unknown as typeof fetch;
    const { result } = renderHook(() =>
      useDebouncedKitSave({ jobId: 1, field: 'cover_letter', externalValue: '', serialize: (t) => t })
    );

    act(() => result.current.onChange('Edited'));
    expect(global.fetch).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(800);
      await flushMicrotasks();
    });
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/jobs/1/kit',
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ field: 'cover_letter', value: 'Edited' }) })
    );
  });

  it('sets a save error when the response is not ok', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false }) as unknown as typeof fetch;
    const { result } = renderHook(() =>
      useDebouncedKitSave({ jobId: 1, field: 'cover_letter', externalValue: '', serialize: (t) => t })
    );

    act(() => result.current.onChange('Edited'));
    await act(async () => {
      vi.advanceTimersByTime(800);
      await flushMicrotasks();
    });

    expect(result.current.saveError).toBe('Could not save your changes.');
  });

  it('sets a network-error message when the fetch rejects', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('network down')) as unknown as typeof fetch;
    const { result } = renderHook(() =>
      useDebouncedKitSave({ jobId: 1, field: 'cover_letter', externalValue: '', serialize: (t) => t })
    );

    act(() => result.current.onChange('Edited'));
    await act(async () => {
      vi.advanceTimersByTime(800);
      await flushMicrotasks();
    });

    expect(result.current.saveError).toBe('Could not reach the server. Your changes may not be saved.');
  });

  it('ignores a stale response that lands after a newer save has already reported failure', async () => {
    let resolveFirst: (value: { ok: boolean }) => void = () => {};
    const firstResponse = new Promise<{ ok: boolean }>((resolve) => {
      resolveFirst = resolve;
    });

    global.fetch = vi
      .fn()
      .mockImplementationOnce(() => firstResponse)
      .mockImplementationOnce(() => Promise.resolve({ ok: false }));

    const { result } = renderHook(() =>
      useDebouncedKitSave({ jobId: 1, field: 'cover_letter', externalValue: '', serialize: (t) => t })
    );

    // Save A: dispatched, slow — its response won't resolve until we call resolveFirst() below.
    act(() => result.current.onChange('abc'));
    act(() => {
      vi.advanceTimersByTime(800);
    });

    // Save B: dispatched after a full pause (not a keystroke inside A's debounce window),
    // resolves immediately with a failure.
    act(() => result.current.onChange('abcd'));
    await act(async () => {
      vi.advanceTimersByTime(800);
      await flushMicrotasks();
    });
    expect(result.current.saveError).toBe('Could not save your changes.');

    // Save A finally lands late, reporting success — it must not overwrite the newer failure.
    await act(async () => {
      resolveFirst({ ok: true });
      await flushMicrotasks();
    });
    expect(result.current.saveError).toBe('Could not save your changes.');
  });
});

describe('linesToText / textToLines', () => {
  it('round-trips a list through newline-joined text, trimming and dropping blanks', () => {
    expect(linesToText(['a', 'b'])).toBe('a\nb');
    expect(linesToText(null)).toBe('');
    expect(textToLines('a\nb\n')).toEqual(['a', 'b']);
    expect(textToLines('  a  \n\n b ')).toEqual(['a', 'b']);
  });
});
