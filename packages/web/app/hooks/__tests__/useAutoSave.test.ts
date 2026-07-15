/**
 * @jest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

const toastErrorMock = jest.fn();

jest.unstable_mockModule('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));
jest.unstable_mockModule('sonner', () => ({
  toast: { error: toastErrorMock },
}));

const { useAutoSave } = await import('../useAutoSave');
const { act, renderHook } = await import('@testing-library/react');

const AUTO_SAVE_DELAY_MS = 5000;

interface HookProps {
  hasPendingOps: boolean;
  flushSeq: number;
  flush: () => Promise<void>;
  enabled: boolean;
}

function defaultProps(flush: () => Promise<void>): HookProps {
  return { hasPendingOps: true, flushSeq: 1, flush, enabled: true };
}

describe('useAutoSave', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    toastErrorMock.mockReset();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('flushes after the debounce delay when there are pending ops', async () => {
    const flush = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
    renderHook((props: HookProps) => useAutoSave(props), { initialProps: defaultProps(flush) });

    await act(async () => {
      await jest.advanceTimersByTimeAsync(AUTO_SAVE_DELAY_MS);
    });

    expect(flush).toHaveBeenCalledTimes(1);
  });

  it('resets the debounce timer when flushSeq changes (continuous editing)', async () => {
    const flush = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const { rerender } = renderHook((props: HookProps) => useAutoSave(props), {
      initialProps: defaultProps(flush),
    });

    await act(async () => {
      await jest.advanceTimersByTimeAsync(AUTO_SAVE_DELAY_MS - 1000);
    });
    rerender({ ...defaultProps(flush), flushSeq: 2 });
    await act(async () => {
      await jest.advanceTimersByTimeAsync(AUTO_SAVE_DELAY_MS - 1000);
    });

    expect(flush).not.toHaveBeenCalled();

    await act(async () => {
      await jest.advanceTimersByTimeAsync(1000);
    });
    expect(flush).toHaveBeenCalledTimes(1);
  });

  it('does not flush when disabled or when there is nothing pending', async () => {
    const flush = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
    renderHook((props: HookProps) => useAutoSave(props), {
      initialProps: { ...defaultProps(flush), enabled: false },
    });
    renderHook((props: HookProps) => useAutoSave(props), {
      initialProps: { ...defaultProps(flush), hasPendingOps: false },
    });

    await act(async () => {
      await jest.advanceTimersByTimeAsync(AUTO_SAVE_DELAY_MS * 2);
    });

    expect(flush).not.toHaveBeenCalled();
  });

  it('shows a toast and retries after a failed flush', async () => {
    const flush = jest
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(undefined);
    renderHook((props: HookProps) => useAutoSave(props), { initialProps: defaultProps(flush) });

    await act(async () => {
      await jest.advanceTimersByTimeAsync(AUTO_SAVE_DELAY_MS);
    });
    expect(flush).toHaveBeenCalledTimes(1);
    expect(toastErrorMock).toHaveBeenCalledWith('autoSaveFailed');

    await act(async () => {
      await jest.advanceTimersByTimeAsync(AUTO_SAVE_DELAY_MS);
    });
    await act(async () => {
      await jest.advanceTimersByTimeAsync(AUTO_SAVE_DELAY_MS);
    });
    expect(flush).toHaveBeenCalledTimes(2);
  });

  it('reports pendingSave and blocks unload while ops are pending', () => {
    const flush = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const { result } = renderHook((props: HookProps) => useAutoSave(props), {
      initialProps: defaultProps(flush),
    });

    expect(result.current.pendingSave).toBe(true);
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it('does not block unload when nothing is pending', () => {
    const flush = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const { result } = renderHook((props: HookProps) => useAutoSave(props), {
      initialProps: { ...defaultProps(flush), hasPendingOps: false },
    });

    expect(result.current.pendingSave).toBe(false);
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });
});
