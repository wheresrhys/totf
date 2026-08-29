'use client';
import { useEffect, useRef, useState } from 'react';

export type LazyTabData<T> = {
	// Undefined until the fetch has resolved at least once (or if the fetch
	// failed) — callers render a loading/empty state while it is undefined.
	data: T | undefined;
	isLoading: boolean;
	error: unknown;
};

/**
 * Fetches a tab's data the first time that tab becomes active, then memoizes
 * the result for the hook's mounted lifetime — reselecting the tab never
 * refetches. Generalises the load-once-on-select shape used by
 * `SessionHighlights`: the fetch is only triggered while `isActive` is true and
 * only ever runs once. Errors are surfaced via `error` and passed to the
 * optional `onError` callback (callers log with their own metadata, per the
 * repo's observability convention) so the tab can fall back to an empty state
 * rather than crashing.
 */
export function useLazyTabData<T>(
	isActive: boolean,
	fetcher: () => Promise<T>,
	options?: { onError?: (error: unknown) => void }
): LazyTabData<T> {
	const [data, setData] = useState<T | undefined>(undefined);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<unknown>(undefined);
	// Guards against refetching: survives tab toggles and React StrictMode's
	// double effect invocation, so the fetcher is called at most once.
	const hasFetchedRef = useRef(false);

	// `fetcher`/`onError` are intentionally excluded from the dependency list:
	// the ref guard already ensures a single fetch, and callers build a fresh
	// fetcher closure each render — including it would re-run the effect
	// needlessly (it would early-return anyway).
	useEffect(() => {
		if (!isActive || hasFetchedRef.current) return;
		hasFetchedRef.current = true;
		setIsLoading(true);
		fetcher()
			.then((result) => setData(result))
			.catch((caughtError) => {
				setError(caughtError);
				options?.onError?.(caughtError);
			})
			.finally(() => setIsLoading(false));
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [isActive]);

	return { data, isLoading, error };
}
