import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, waitFor, cleanup } from '@testing-library/react';
import { useLazyTabData } from '../useLazyTabData';

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

describe('useLazyTabData', () => {
	it('does not call the fetcher while isActive is false', () => {
		const fetcher = vi.fn().mockResolvedValue('data');
		renderHook(() => useLazyTabData(false, fetcher));
		expect(fetcher).not.toHaveBeenCalled();
	});

	it('calls the fetcher exactly once when isActive becomes true', async () => {
		const fetcher = vi.fn().mockResolvedValue('data');
		const { rerender } = renderHook(
			({ isActive }) => useLazyTabData(isActive, fetcher),
			{ initialProps: { isActive: false } }
		);
		expect(fetcher).not.toHaveBeenCalled();
		rerender({ isActive: true });
		await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
	});

	it('returns isLoading true while the fetch is pending, then the resolved data', async () => {
		let resolveFetch: (value: string) => void = () => {};
		const fetcher = vi.fn(
			() =>
				new Promise<string>((resolve) => {
					resolveFetch = resolve;
				})
		);
		const { result } = renderHook(() => useLazyTabData(true, fetcher));

		await waitFor(() => expect(result.current.isLoading).toBe(true));
		expect(result.current.data).toBeUndefined();

		resolveFetch('resolved');
		await waitFor(() => expect(result.current.isLoading).toBe(false));
		expect(result.current.data).toBe('resolved');
	});

	it('does not refetch when isActive toggles false then true again (memoization)', async () => {
		const fetcher = vi.fn().mockResolvedValue('data');
		const { rerender } = renderHook(
			({ isActive }) => useLazyTabData(isActive, fetcher),
			{ initialProps: { isActive: true } }
		);
		await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
		rerender({ isActive: false });
		rerender({ isActive: true });
		// give any erroneous refetch a chance to fire
		await Promise.resolve();
		expect(fetcher).toHaveBeenCalledTimes(1);
	});

	it('keeps a second hook instance independent (no shared cache)', async () => {
		const fetcherA = vi.fn().mockResolvedValue('a');
		const fetcherB = vi.fn().mockResolvedValue('b');
		const hookA = renderHook(() => useLazyTabData(true, fetcherA));
		const hookB = renderHook(() => useLazyTabData(false, fetcherB));

		await waitFor(() => expect(hookA.result.current.data).toBe('a'));
		expect(fetcherB).not.toHaveBeenCalled();
		expect(hookB.result.current.data).toBeUndefined();
	});

	it('sets an error state, calls onError, and does not retry when the fetcher rejects', async () => {
		const failure = new Error('boom');
		const fetcher = vi.fn().mockRejectedValue(failure);
		const onError = vi.fn();
		const { result } = renderHook(() =>
			useLazyTabData(true, fetcher, { onError })
		);

		await waitFor(() => expect(result.current.error).toBe(failure));
		expect(onError).toHaveBeenCalledWith(failure);
		expect(result.current.isLoading).toBe(false);
		expect(result.current.data).toBeUndefined();
		// no automatic retry
		await Promise.resolve();
		expect(fetcher).toHaveBeenCalledTimes(1);
	});

	it('fetches exactly once when isActive is true on the first render (default-active tab)', async () => {
		const fetcher = vi.fn().mockResolvedValue('data');
		const { result } = renderHook(() => useLazyTabData(true, fetcher));
		await waitFor(() => expect(result.current.data).toBe('data'));
		expect(fetcher).toHaveBeenCalledTimes(1);
	});
});
